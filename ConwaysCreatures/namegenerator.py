import random

# Vollständige Morphem-Silben für maximale Vielfalt
prefixes = [
    "Ael", "Aer", "An", "Ar", "Az", "Bael", "Bel", "Bor", "Bra", "Cael", 
    "Cal", "Cel", "Dael", "Dar", "Del", "Dra", "Eld", "Ely", "Esh", "Fael", 
    "Far", "Fel", "Gael", "Gar", "Gor", "Hael", "Har", "Ith", "Il", "Kael", 
    "Kar", "Kor", "Lael", "Lor", "Mael", "Mor", "Nael", "Nor", "Ny", "Oel"
]

roots = [
    "gorg", "morg", "tharn", "vorn", "zurn", "drak", "grak", "thrak", "glyn", "mlyn", 
    "grost", "mrost", "grend", "mrend", "blak", "clak", "brok", "crok", "brik", "crik", 
    "bryn", "cryn", "brith", "vond", "zond", "gond", "skor", "storn", "krall", "gant", 
    "gari", "gora", "gile", "gurn", "bren", "bron", "brun", "brin", "bran", "cron"
]

suffixes = [
    "ith", "ath", "oth", "uth", "eth", "ax", "ox", "ux", "ex", "ix", 
    "on", "an", "en", "un", "in", "or", "ar", "er", "ur", "ir", 
    "as", "os", "us", "es", "is", "ak", "ok", "uk", "ek", "ik", 
    "ald", "old", "uld", "eld", "ard", "ord", "urd", "ang", "ong", "ung"
]

# Set stellt sicher, dass jeder Name absolut einzigartig ist
names = set()

# Schleife läuft, bis exakt 7000 einzigartige Namen generiert wurden
while len(names) < 7000:
    name = f"{random.choice(prefixes)}{random.choice(roots)}{random.choice(suffixes)}"
    names.add(name)

# Die Namen werden sortiert und direkt in die Konsole "geechot"
for name in sorted(list(names)):
    print(name)

