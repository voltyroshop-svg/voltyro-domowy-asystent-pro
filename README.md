# VOLTYRO Domowy Asystent PRO

Polskojęzyczna aplikacja PWA do zapisywania sprzętu domowego, dokumentów, gwarancji, napraw i reklamacji. Dane i pliki pozostają w IndexedDB urządzenia. Pełna kopia JSON pozwala przenieść je na inne urządzenie. Import zastępuje bieżącą zawartość po sprawdzeniu pliku i potwierdzeniu. Kopia może zawierać poufne dane i powinna pozostać prywatna.

## Uruchomienie i testy

Wymagane Node.js 20+ do testów. Aplikacja jest statyczna i nie wymaga instalowania zależności ani procesu budowania.

```sh
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
