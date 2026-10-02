
import sys,json
from faster_whisper import WhisperModel
model=WhisperModel(sys.argv[1],device="cpu",compute_type="int8",local_files_only=True)
segments,info=model.transcribe(sys.argv[2],language=sys.argv[3],vad_filter=True,beam_size=3)
text=" ".join(s.text.strip() for s in segments if s.no_speech_prob<0.6).strip()
print(json.dumps({"text":text},ensure_ascii=True))
