# VOLTYRO Domowy Asystent PRO

Polskojęzyczna aplikacja PWA do zapisywania sprzętu domowego, dokumentów, gwarancji, napraw i reklamacji. Dane i pliki pozostają w IndexedDB urządzenia. Pełna kopia składa się z manifestu JSON i binarnych części, które można przenieść na inne urządzenie. Import zastępuje bieżącą zawartość po sprawdzeniu kompletu, potwierdzeniu i zapisaniu punktu odzyskiwania. Kopia może zawierać poufne dane i powinna pozostać prywatna.

## Uruchomienie i testy

Wymagane Node.js 20+ do testów. Produkcja jest statyczna. Jedyna zależność instalowana przez npm służy do testowania IndexedDB.

```sh
npm ci
npm test
python3 -m http.server 8080
```

Wersja lokalna działa pod adresem http://localhost:8080. Do instalacji na telefonie potrzebny jest działający adres HTTPS.

## GitHub Pages

Źródło publikacji to gałąź `main`, katalog `/ (root)`. Wszystkie ścieżki są względne, także zakres Service Workera. Przy zmianach aplikacji zwiększ wersję cache w `sw.js`. Użytkownik może zastosować pobraną aktualizację z poziomu Ustawień po zakończeniu edycji.

- iPhone: otwórz adres w Safari, wybierz **Udostępnij → Dodaj do ekranu początkowego**.
- Android: otwórz adres w Chrome, wybierz **⋮ → Zainstaluj aplikację** lub **Dodaj do ekranu głównego**.

Tryb offline jest dostępny po pierwszym pełnym załadowaniu. Kopię zapasową należy zachować poza aplikacją, ponieważ przeglądarka może usunąć lokalne dane. Pliki ICS przekazują terminy do kalendarza urządzenia. Aplikacja nie wysyła powiadomień.

## Architektura

`model.js` zawiera walidację, obliczenia i logikę domeny. `storage.js` odpowiada za zapisy, dokumenty i wersjonowany format kopii. `app.js` odpowiada za interfejs. Rozdzielenie tych odpowiedzialności pozwala później dodać tłumaczenia, synchronizację lub osobne wersje mobilne bez zmiany reguł gwarancji. PDF.js z licencją Apache jest przechowywany lokalnie w `pdf/`.

## Paragony i lokalny OCR

IndexedDB v2 zachowuje magazyn produktów i dodaje osobne archiwum. Kopie v2 zawierają zdjęcia paragonów, pozycje i powiązania. Kopie v1 można odtworzyć. Paragony dodane do produktów w starszych wersjach nadal są dostępne w szczegółach produktów.

Folder `ocr/` zawiera Tesseract.js 6.0.1, jego silnik LSTM oraz polski model `@tesseract.js-data/pol` 1.0.0 (best_int). Licencję Apache 2.0 silnika i danych Tesseract dołączono w tym folderze. Pliki są serwowane z tej samej domeny i trafiają do cache offline. Rozpoznawanie odbywa się w lokalnym workerze. Po odczycie użytkownik sprawdza kwoty oraz wybiera pozycje, dla których chce utworzyć produkty.
