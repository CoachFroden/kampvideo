# Kampvideo

Lukket kamp- og videoportal for Samnanger. Appen bruker Firebase Authentication, serverkontrollert godkjenning og en privat Cloudflare R2-bøtte.

## Sikkerhetsmodell

- R2-objekter er private og eksponeres kun med signerte URL-er som varer i 60 sekunder.
- Firebase ID-token verifiseres på serveren før hver forespørsel.
- Brukeren må i tillegg ha `approved: true` i `users/{uid}` i Firestore.
- Nettleseren har ingen direkte Firestore-tilgang.
- Hemmeligheter skal bare settes som miljøvariabler på serveren.

## Lokal oppstart

1. Kopier `.env.example` til `.env.local` og fyll inn verdiene.
2. Aktiver Google og/eller e-post/passord i Firebase Authentication.
3. Opprett Firestore-databasen og publiser `firestore.rules`.
4. Kjør `npm install` og `npm run dev`.

## Datamodell

Opprett dokumenter i `matches` med feltene:

```json
{
  "opponent": "Bønes 2",
  "date": "31. august 2026",
  "venue": "Samnanger kunstgras",
  "competition": "G14 · 3. divisjon",
  "homeScore": 1,
  "awayScore": 3,
  "videoKey": "kamper/bonnes-2.mp4",
  "clips": [
    { "id": "maal-1", "title": "Målet vårt", "category": "Angrep", "minute": "35:18", "start": 2118, "end": 2140 }
  ]
}
```

Dato kan senere flyttes til Firestore Timestamp når administrasjonssiden bygges.

## Første administrator

Logg inn én gang. Firebase oppretter da et dokument i `users`. Sett `approved` til `true` og `role` til `admin` direkte i Firebase Console. Dette er bevisst manuelt for første konto, slik at ingen kan gjøre seg selv til administrator.
