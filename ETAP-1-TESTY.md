# Etap 1 — kopie i odzyskiwanie

- Baza kodu `bf08760`. Czysty katalog roboczy przed zmianą. `npm ci` z lokalnym cache i `npm test` na bazie kodu zakończyły się wynikiem 24/24.
- Po zmianach pełne `npm test` przeszło 31/31. Przypadki obejmują 7 × 18 MiB, stary format v1–v3, uszkodzoną część i manifest, część z obcej kopii, blokadę migracji, brak miejsca przy zapisie punktu, jednoczesny zapis z dwóch połączeń i odzyskanie produktu, paragonu, sprawy i stanu sprzed importu.
- W ustawieniach pobierz manifest i każdą część osobno. Po zapisaniu plików w systemie potwierdź zapis, aby utrwalić datę eksportu. Przy odtwarzaniu wybierz wszystkie pliki razem. Starszą kopię JSON wybierz samodzielnie. Licznik przed przywróceniem obejmuje również dokumenty z historii spraw.
- Import zapisuje jeden odwracalny punkt sprzed zastąpienia. Kosz lokalny zachowuje oddzielne wpisy usuniętych rekordów. Przy odtwarzaniu paragonu łącza do produktów przywracają się, jeśli produkt zachował rewizję po odłączeniu paragonu. Produkty zmienione później można powiązać ręcznie. Dokumenty punktów odzyskiwania zużywają przydział pamięci IndexedDB.
- Migracja IndexedDB z wersji 3 do 4 dodaje magazyn odzyskiwania. Starszy kod jawnie otwierający wersję 3 nie otworzy bazy po migracji bez aktualizacji do obsługi v4. Wyeksportowane pliki v4 odtworzy kod obsługujący ten format. Przed testem użyj odrębnego profilu z danymi testowymi.
- SHA-256 wykrywa przypadkowe uszkodzenie manifestu lub części. Kopia **nie jest szyfrowana**, więc przechowuj komplet w prywatnym miejscu. Weryfikacja wczytuje do haszowania pojedynczy załącznik. Import do IndexedDB przygotowuje bufory zapisu i punkt odzyskiwania, więc wymaga wolnej pamięci i miejsca na urządzeniu.
- Koszt dodatkowy 0 zł. Bez publikacji, scalenia z main i zmian w innych projektach.

## Próby w przeglądarce

Chromium desktop, Chromium z profilem Android Pixel 7 i WebKit z profilem iPhone 13 pobrały manifest oraz siedem części, odrzuciły brakujący komplet, pokazały licznik przed zatwierdzeniem, odtworzyły 132 120 576 bajtów i zachowały powiązanie paragonu z produktem. W dwóch kartach Chromium konflikt pozostawił szkic drugiej karty w formularzu. Na fizycznych urządzeniach do sprawdzenia pozostały wybór wielu plików z systemowego okna oraz zużycie pamięci na dużym zbiorze.
