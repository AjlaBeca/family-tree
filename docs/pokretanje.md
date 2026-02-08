# Pokretanje projekta

Ovo je mali projekat za vođenje porodičnog stabla (frontend + backend).

## Preduvjeti

- Node.js (preporučeno LTS)
- npm

## Instalacija

```powershell
npm install
npm install --prefix backend
```

## Pokretanje

Frontend + backend zajedno:

```powershell
npm run dev
```

Samo frontend:

```powershell
npm start
```

Samo backend:

```powershell
npm run server
```

## Napomena (Windows / PowerShell)

Ako `npm`/`node` nisu u PATH-u, može pomoći:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

Ako PowerShell blokira skripte, privremeno (samo za ovaj proces):

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
