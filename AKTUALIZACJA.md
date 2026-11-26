# Aktualizacja i odzyskiwanie

Punkt odniesienia produkcji przed etapem 1 to commit `bf08760`, zapisany na gałęzi `backup/pages-before-stage1`.

1. Przed aktualizacją, jeśli to możliwe, zapisz i przenieś kopię poza przeglądarkę. Dotychczasowa wersja eksportuje jeden JSON. Jeżeli jej limit blokuje dużą kolekcję, zachowaj aplikację i jej dane na urządzeniu, zaktualizuj ją w miejscu i od razu wyeksportuj komplet v4 z Ustawień.
2. Po aktualizacji sprawdź produkty, powiązane paragony i próbkę załączników. Nową kopię zachowaj jako manifest i wszystkie części. Zapis w Ustawieniach potwierdź po sprawdzeniu plików w systemie.
3. Przy nieudanym odtworzeniu nie usuwaj danych witryny. Popraw komplet plików lub zwolnij miejsce poza aplikacją. Po omyłkowym zastąpieniu wybierz w Ustawieniach odzyskiwanie danych sprzed importu.
4. W razie problemu z kodem opublikuj poprawkę z zachowaniem obsługi IndexedDB v4 i kopii v4. Nie przywracaj wprost starego kodu otwierającego wyłącznie v3 po wykonaniu migracji na urządzeniach. Gałąź bezpieczeństwa zachowuje stare źródła, a kopia plikowa pozwala odtworzyć dane w zgodnej wersji.
