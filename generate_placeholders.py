import os
from PIL import Image

# 1. Create a dummy sprite
os.makedirs('assets/sprites', exist_ok=True)
img = Image.new('RGB', (64, 64), color = 'white')
img.save('assets/sprites/base_enemy.png') # Phaser will load PNG fine

# 2. Create a dummy background
os.makedirs('assets/backgrounds', exist_ok=True)
bg = Image.new('RGB', (800, 600), color = 'black')
bg.save('assets/backgrounds/default_bg.png')

# 3. Create dummy audio
os.makedirs('assets/audio', exist_ok=True)
import wave
with wave.open('assets/audio/default_bgm.wav', 'w') as f:
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(44100)
    f.writeframes(b'\x00\x00' * 44100) # 1 second of silence
