# Porodični atlas

Web aplikacija za vizualizaciju i upravljanje porodičnim stablom.

## Brzi start

```powershell
npm install
npm install --prefix backend
npm run dev
```

Frontend: `http://localhost:3000`  
Backend API: `http://localhost:5000`

Detaljnije uputstvo: `docs/pokretanje.md`.

## Skripte

- `npm run dev` - pokreće backend i frontend zajedno
- `npm start` - pokreće samo frontend
- `npm run server` - pokreće samo backend

## Struktura

- `src/` - React frontend
- `backend/` - Express backend + SQLite (baza: `backend/data/family.db`)
