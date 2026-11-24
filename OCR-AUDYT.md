# Audyt OCR paragonów

Poprzednia wersja przekazywała zdjęcie do Tesseract.js w jednym przebiegu i ogłaszała zakończenie odczytu po każdym niepustym wyniku. Przypadkowe znaki mogły więc wyglądać jak udany odczyt. Dodano wykrywanie papieru, korekcję perspektywy, ręczne kadrowanie i zmianę obrotu, wyrównanie oświetlenia, redukcję szumu, wyostrzenie i kontrolę jakości na podstawie struktury dokumentu oraz pewności linii. Zdjęcie oryginalne jest zachowywane osobno. Formularz wymaga sprawdzenia przed zapisem.

## Metoda pomiaru

- 22 różne zdjęcia lub skany rzeczywistych polskich paragonów fiskalnych porównano z ręcznie odczytanymi polami. Materiały zawierają m.in. słabo widoczny druk, pieczątkę i tło z nadrukiem. Z kopii roboczych usunięto zbędne dane, w szczególności identyfikatory transakcji i kody. Zdjęcia oraz surowe wyniki pozostają poza repozytorium. Źródło [Wikimedia Commons – Receipts of Poland](https://commons.wikimedia.org/wiki/Category:Receipts_of_Poland).
- Zbiór obejmował identyfikatory plików Commons 113418258, 150731698, 151292330, 151293763, 151298286, 151315374, 151363334, 151586602, 151619070, 155494402, 155543863, 155605792, 159200846, 170651443, 172216516, 172216680, 178811387, 181176701, 182836242, 189966703, 189967411 i 85751702.
- Cztery dodatkowe warianty tych zdjęć z perspektywą trapezową, zmniejszonym kontrastem i cieniem posłużyły do oddzielnej próby obciążeniowej. Automatyczny kadr zadziałał w 4/4. W 2/4 rozpoznano poprawną sumę, a w pozostałych dwóch aplikacja poprosiła o nowe zdjęcie. Dodatkowy wydruk potwierdzenia karty bez paragonu fiskalnego został odrzucony.
- Pomiar wykonano w Chromium z polskim modelem Tesseract.js. Dla sprzedawcy kryterium było rozpoznanie nazwy lub marki. Datę, NIP, kwotę i formę płatności oceniono na zgodność z wydrukiem. Dla pozycji sprawdzono jedną pozycję referencyjną na paragonie. Cenę, ilość i cenę jednostkową zaliczano po poprawnym dopasowaniu nazwy i kwoty tej pozycji. Puste pola liczono jako brak odczytu. Pola wyłączone w anonimizacji pominięto w mianowniku.

## Wynik

| Metoda | Poprawne pola w porównaniu |
|---|---:|
| Oryginalny obraz, automatyczna segmentacja | 31 |
| Kadr i lokalnie wyrównana skala szarości | 50 |
| Kadr i lokalne progowanie czarno-białe | 40 |
| Kadr kolorowy, segmentacja kolumny | 30 |
| Wybrany przebieg adaptacyjny | 55 |

Skala szarości jest wykonywana najpierw. Przy słabszym wyniku aplikacja może dodatkowo sprawdzić kolorowy kadr, a gdy nie spełnia warunków jakości, uruchomić progowanie. Sprzeczne wartości mogą zostać wyczyszczone. W 15/22 przypadkach aplikacja przedstawiła dane do sprawdzenia. W 7/22 poprosiła o nowe zdjęcie.

| Pole | Poprawnie |
|---|---:|
| Sklep | 8/21 |
| NIP | 9/18 |
| Data zakupu | 8/22 |
| Kwota całkowita | 14/22 |
| Forma płatności | 7/22 |
| Nazwa pozycji referencyjnej | 3/22 |
| Kwota pozycji referencyjnej | 2/22 |
| Ilość pozycji referencyjnej | 2/22 |
| Cena jednostkowa pozycji referencyjnej | 2/22 |

W wybranym przebiegu wszystkie 14 zaproponowanych sum zgadzało się z wydrukiem. Jedna z dziewięciu propozycji daty i jedna z dziewięciu propozycji sprzedawcy były błędne. Wyniki dotyczą tej próby. Pozycje zakupowe nadal wymagają częstej ręcznej korekty.
