# Porównanie OCR polskich paragonów

Na 22 rzeczywistych dokumentach z ręcznie sprawdzonymi wartościami porównano dotychczasową wersję, sam model PaddleOCR PP-OCRv5 Latin oraz nową wersję aplikacji w Chromium. Mianownik obejmuje tylko dokumenty z potwierdzoną wartością referencyjną dla pola. Dla pozycji oceniono jedną oznaczoną pozycję na paragon, bez wnioskowania o skuteczności rozpoznania całej listy.

| Pole | Dotychczasowa PWA | Sam PaddleOCR | Nowa PWA |
| --- | ---: | ---: | ---: |
| Kwota całkowita | 14/22 | 17/22 | 18/22 |
| Data | 8/22 | 15/22 | 16/22 |
| Sprzedawca | 8/21 | 16/21 | 18/21 |
| NIP | 9/18 | 16/18 | 17/18 |
| Forma płatności | 7/22 | 14/22 | 13/22 |
| Nazwa referencyjnej pozycji | 3/22 | 5/22 | 4/22 |
| Ilość, cena jednostkowa i kwota referencyjnej pozycji | 2/22 każda | 5/22 każda | 4/22 każda |

Pomiar PWA rozpoczął się przed końcową zmianą uruchamiającą Tesseract również wtedy, gdy PaddleOCR poprawnie odczytał inne pola, ale brakowało kwoty. Dlatego tabela opisuje zmierzoną wersję roboczą. Cele skuteczności nie zostały potwierdzone. Brakujący odczyt liczy się jako niepowodzenie. W nowej PWA wszystkie 18 zaproponowanych kwot zgadzało się z wartościami referencyjnymi.

Na kolejnych 28 różnych rzeczywistych zdjęciach uruchomiono sam PaddleOCR z parserem. W 26 pojawiła się propozycja kwoty, w 23 daty i w 26 NIP-u. Dla całej dodatkowej grupy nie ma ręcznej weryfikacji wszystkich pól, więc te liczby opisują pokrycie propozycjami, bez oceny ich poprawności. Wyniki 22 ręcznie sprawdzonych zdjęć nie reprezentują osobno wyblakłych i pogniecionych paragonów.

Regresje obejmują prawidłową kwotę 300 zł przy uszkodzonym nagłówku, sprzeczne kwoty, ręczne kadrowanie, migrację IndexedDB i starsze kopie zapasowe. W pełnym przebiegu interfejsu rozpoznano paragon ALDI i zapisano ręczną zmianę w Chromium z emulacją Androida oraz w WebKit z emulacją iPhone’a. Aparat, wybór pliku HEIC i instalowana PWA na fizycznym iPhonie nadal wymagają sprawdzenia. Z opisu użytkownika nie da się ustalić technicznej przyczyny błędu jego konkretnego zdjęcia.

Model PaddleOCR działa lokalnie przez WASM. Model i środowisko uruchomieniowe zajmują ok. 27 MB i są dociągane przy pierwszym użyciu. Tesseract pozostaje ścieżką zapasową, także gdy model nie został jeszcze pobrany na potrzeby pracy offline. Pliki paragonów pozostają w urządzeniu. Model chmurowy nie uczestniczył w porównaniu.

- [PaddleOCR PP-OCRv5 i obsługiwane języki](https://www.paddleocr.ai/v3.6.0/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html)
- [Apple Vision i obsługiwane języki rozpoznawania](https://developer.apple.com/documentation/vision/recognizetextrequest/supportedrecognitionlanguages)
- [Google Document AI i cennik usług chmurowych](https://cloud.google.com/products/document-ai/pricing)
