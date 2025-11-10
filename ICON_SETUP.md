# RamboFlow Icon Setup

## Benötigte Icon-Dateien

Platziere die folgenden Dateien im `/public` Ordner:

### 1. Favicon (Browser-Tab-Icon)
- **favicon.ico** - 32x32 oder 16x16 px
  - Wird im Browser-Tab angezeigt

### 2. PWA Icons (Progressive Web App)
- **icon-192x192.png** - 192x192 px
  - Wird für PWA-Installation verwendet
  - Sollte einen kleinen Rand/Padding haben (safe area)

- **icon-512x512.png** - 512x512 px
  - Hochauflösendes PWA-Icon
  - Wird auf neueren Geräten verwendet

### 3. Apple Touch Icon
- **apple-touch-icon.png** - 180x180 px
  - Wird verwendet wenn App zum iOS Home-Screen hinzugefügt wird

## Icon-Konvertierung von JPG

Du hast aktuell ein JPG-Icon. Hier sind die Schritte zur Konvertierung:

### Option 1: Online Tools (am einfachsten)
1. Gehe zu https://favicon.io/favicon-converter/
2. Lade dein JPG hoch
3. Downloade das Favicon-Package
4. Extrahiere die Dateien in den `/public` Ordner

### Option 2: Mit Photoshop/GIMP
1. Öffne dein JPG-Icon
2. Erstelle quadratische Versionen in verschiedenen Größen:
   - 16x16, 32x32 (für favicon.ico)
   - 180x180 (für apple-touch-icon.png)
   - 192x192 (für icon-192x192.png)
   - 512x512 (für icon-512x512.png)
3. Exportiere als PNG mit transparentem Hintergrund (empfohlen)
4. Für favicon.ico: Kombiniere 16x16 und 32x32 in einer .ico Datei

### Option 3: Mit ImageMagick (Command Line)
```bash
# Installiere ImageMagick falls nicht vorhanden
# macOS: brew install imagemagick
# Ubuntu: sudo apt-get install imagemagick

# Konvertiere JPG zu verschiedenen PNG-Größen
convert ramboflow-icon.jpg -resize 192x192 public/icon-192x192.png
convert ramboflow-icon.jpg -resize 512x512 public/icon-512x512.png
convert ramboflow-icon.jpg -resize 180x180 public/apple-touch-icon.png
convert ramboflow-icon.jpg -resize 32x32 -transparent white public/favicon-32.png
convert ramboflow-icon.jpg -resize 16x16 -transparent white public/favicon-16.png

# Erstelle favicon.ico aus den kleinen PNGs
convert public/favicon-16.png public/favicon-32.png public/favicon.ico
```

### Option 4: Mit Python + Pillow
```python
from PIL import Image

# Lade dein JPG
img = Image.open('ramboflow-icon.jpg')

# Erstelle verschiedene Größen
sizes = [
    (16, 'public/favicon-16.png'),
    (32, 'public/favicon-32.png'),
    (180, 'public/apple-touch-icon.png'),
    (192, 'public/icon-192x192.png'),
    (512, 'public/icon-512x512.png'),
]

for size, filename in sizes:
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(filename, 'PNG')

# Für favicon.ico brauchst du ein separates Tool oder Online-Konverter
```

## Design-Tipps

- **Einfach halten**: Icons sollten bei kleinen Größen gut erkennbar sein
- **Kontrast**: Achte auf guten Kontrast für dunkle und helle Hintergründe
- **Safe Area**: Lass 10% Rand für PWA-Icons (maskable icons)
- **Transparenz**: PNG mit transparentem Hintergrund ist ideal

## Nach der Konvertierung

1. Platziere alle Dateien im `/public` Ordner
2. Starte den Dev-Server neu: `npm run dev`
3. Teste in verschiedenen Browsern:
   - Chrome: Tab-Icon, PWA-Installation
   - Safari: iOS Home Screen Icon
   - Firefox: Favicon

## Aktueller Status

✅ Manifest erstellt (`/public/manifest.json`)
✅ HTML-Links konfiguriert (`/index.html`)
⏳ Icons müssen noch von JPG konvertiert werden

## Schnellstart

Wenn du mir das JPG schickst oder in den `/public` Ordner legst, kann ich dir bei der Konvertierung helfen!
