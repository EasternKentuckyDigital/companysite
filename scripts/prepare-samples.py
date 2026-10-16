"""Prepare the bundled CC0 instrument recordings. Requires Python + numpy and macOS afconvert.
Run from the repository root. Downloads stay in /tmp; only prepared WAVs and provenance ship.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib, json, subprocess, urllib.request, urllib.parse, wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tools/ear-training/samples'
CACHE = Path('/tmp/ekd-audio-sources')
CACHE.mkdir(exist_ok=True)
OUT.mkdir(exist_ok=True)
COMMITS = {'piano': 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e', 'violin': '440300901dfe9275fd84e0b7763af1f8443ae62e', 'guitar': '6f4eb1b092acc88f5448cea1a0001bd07b971af8'}
# VCSL Kawai filenames use C3 for MIDI 60 (middle C); scientific notation uses C4.
PIANO = [(48,'C2'),(52,'E2'),(54,'F#2'),(56,'G#2'),(58,'A#2'),(60,'C3'),(64,'E3'),(66,'F#3'),(68,'G#3'),(70,'A#3'),(72,'C4')]
VIOLIN = [(55,'G3'),(57,'A3'),(60,'C4'),(64,'E4'),(67,'G4'),(69,'A4'),(72,'C5')]
GUITAR = [(m,n) for m,n in [(48,'C3'),(52,'E3'),(55,'G3'),(56,'G#3'),(57,'A3'),(58,'A#3'),(59,'B3'),(60,'C4'),(61,'C#4'),(62,'D4'),(63,'D#4'),(64,'E4'),(65,'F4'),(66,'F#4'),(67,'G4'),(69,'A4'),(70,'A#4'),(71,'B4'),(72,'C5')]]
records = []
for instrument, notes, repo, template in [
    ('piano', PIANO, 'sgossner/VCSL', 'Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_{note}_v3_rr1_Player.wav'),
    ('violin', VIOLIN, 'sgossner/VSCO-2-CE', 'Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_{note}_p.wav'),
    ('guitar', GUITAR, 'freepats/spanish-classical-guitar', 'samples/{note}.flac'),
]:
    for midi,note in notes:
        path=template.format(note=note)
        records.append({'instrument':instrument,'midi':midi,'source':f'https://raw.githubusercontent.com/{repo}/{COMMITS[instrument]}/'+urllib.parse.quote(path), 'extension':Path(path).suffix})
MANDOLIN_URL='https://cdn.freesound.org/previews/255/255837_4632831-hq.mp3'

def download(url, path):
    if not path.exists():
        req=urllib.request.Request(url,headers={'User-Agent':'EasternKentuckyDigital sample preparation'})
        with urllib.request.urlopen(req,timeout=45) as response: path.write_bytes(response.read())
    return path

def read_audio(path):
    decoded=path.with_suffix('.decoded.wav')
    if not decoded.exists():
        subprocess.run(['/usr/bin/afconvert','-f','WAVE','-d','LEI16@44100',str(path),str(decoded)],check=True)
    with wave.open(str(decoded)) as w:
        channels=w.getnchannels()
        samples=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(float).reshape(-1,channels).mean(axis=1)/32768
    return samples

def write_audio(samples, instrument, midi):
    # Remove subsonic rumble/DC without changing the instrument's natural attack.
    alpha=np.exp(-2*np.pi*65/44100)
    filtered=np.empty_like(samples)
    prev_x=prev_y=0.
    for i,value in enumerate(samples):
        prev_y=alpha*(prev_y+value-prev_x); prev_x=value; filtered[i]=prev_y
    samples=filtered
    # Consistent peak level, with headroom for interval playback; retain natural decay.
    peak=np.max(np.abs(samples))
    samples*=.82/max(peak,.00001)
    fade=min(4410,len(samples)//5)
    samples[-fade:]*=np.linspace(1,0,fade)
    samples[:132]*=np.linspace(0,1,132)
    # 22.05 kHz mono PCM is small, universal, and retains the useful acoustic range.
    # A windowed-sinc low-pass before decimation avoids aliasing.
    taps=63; n=np.arange(taps)-(taps-1)/2
    kernel=.44*np.sinc(.44*n)*np.hamming(taps); kernel/=kernel.sum()
    samples=np.convolve(samples,kernel,mode='same')[::2]
    folder=OUT/instrument; folder.mkdir(exist_ok=True)
    path=folder/f'{midi}.wav'
    with wave.open(str(path),'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
        w.writeframes((np.clip(samples,-1,1)*32767).astype('<i2').tobytes())
    return {'file':str(path.relative_to(OUT)), 'sha256':hashlib.sha256(path.read_bytes()).hexdigest(), 'duration':round(len(samples)/22050,4)}

def tune(samples, midi):
    # Autocorrelation combines the fundamental and its overtones and avoids mistaking
    # a strong second harmonic for a note an octave higher. Preserve natural vibrato.
    sr=44100; expected=440*2**((midi-69)/12)
    segment=samples[int(.065*sr):min(len(samples),int(.38*sr))]
    segment=(segment-segment.mean())*np.hanning(len(segment))
    size=1 << (2*len(segment)-1).bit_length()
    spectrum=np.fft.rfft(segment,size)
    correlation=np.fft.irfft(spectrum*np.conj(spectrum),size)
    lo=int(sr/(expected*1.04)); hi=int(sr/(expected*.96))
    lag=lo+np.argmax(correlation[lo:hi+1])
    left,center,right=correlation[lag-1:lag+2]
    adjustment=.5*(left-right)/(left-2*center+right)
    measured=sr/(lag+adjustment)
    ratio=expected/measured
    tuned=np.interp(np.arange(0,len(samples)-1,ratio),np.arange(len(samples)),samples)
    return tuned,round(1200*np.log2(ratio),2)

def prepare(record):
    instrument,midi=record['instrument'],record['midi']
    original=download(record['source'],CACHE/(hashlib.sha256(record['source'].encode()).hexdigest()[:16]+record['extension']))
    samples=read_audio(original)
    # Trim leading silence with a 6 ms pre-roll, retaining the recorded attack.
    active=np.flatnonzero(np.abs(samples) > np.max(np.abs(samples))*.012)
    start=max(0,int(active[0])-265) if len(active) else 0
    samples=samples[start:start+int(2.4*44100)]
    samples,cents=tune(samples,midi)
    result={**record,**write_audio(samples,instrument,midi),'source_sha256':hashlib.sha256(original.read_bytes()).hexdigest(),'trim_start':round(start/44100,5),'tuning_cents':cents,'license':'CC0-1.0'}
    print(instrument,midi,result['duration'],flush=True)
    return result

with ThreadPoolExecutor(max_workers=5) as executor:
    processed=list(executor.map(prepare,records))

# Eight individually played notes from a CC0 mandolin scale. Exclude handling noise.
# The recorded instrument is approximately 20 cents sharp: tune each note to A4=440.
original=download(MANDOLIN_URL,CACHE/'mandolin-scale.mp3')
scale=read_audio(original)
for midi,start,end in [(60,.895,1.30),(62,1.35,1.79),(64,1.84,2.25),(65,2.295,2.70),(67,2.745,3.16),(69,3.20,3.61),(71,3.65,4.08),(72,4.125,4.60)]:
    samples=scale[int(start*44100):int(end*44100)].copy()
    # Reduce low room/handling noise without synthesizing or replacing the pluck.
    expected=440*2**((midi-69)/12)
    frequencies=np.fft.rfftfreq(len(samples),1/44100)
    gain=np.clip((frequencies/expected-.75)/.2,0,1)
    samples=np.fft.irfft(np.fft.rfft(samples)*(.5-.5*np.cos(gain*np.pi)),len(samples))
    samples,cents=tune(samples,midi)
    result={'instrument':'mandolin','midi':midi,'source':MANDOLIN_URL,'source_page':'https://freesound.org/people/Taku19810729/sounds/255837/','source_sha256':hashlib.sha256(original.read_bytes()).hexdigest(),'trim_start':start,'trim_end':end,'tuning_cents':cents,'license':'CC0-1.0',**write_audio(samples,'mandolin',midi)}
    processed.append(result)
    print('mandolin',midi,'tuning',result['tuning_cents'],flush=True)
license_path=OUT/'CC0-1.0.txt'
license_path.write_bytes(download(f'https://raw.githubusercontent.com/sgossner/VCSL/{COMMITS["piano"]}/LICENSE',CACHE/'CC0-license.txt').read_bytes())
(OUT/'sources.json').write_text(json.dumps({'license':'CC0-1.0','sample_rate':22050,'channels':1,'processing':'Mono mix, leading-silence trim, 65 Hz high-pass, peak normalization to 0.82, short edge fades, anti-aliased downsample to 22.05 kHz, 16-bit PCM. All notes tuned to A4=440. Mandolin scale sliced and low room noise reduced; natural decays and violin vibrato retained.','recordings':processed},indent=2)+'\n')
print('Prepared',len(processed),'recordings;',sum(p.stat().st_size for p in OUT.rglob('*.wav')),'bytes')
