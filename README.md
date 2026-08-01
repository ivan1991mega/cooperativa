# 🏕️ Gestione Prenotazioni — Cooperativa Scout

Applicazione web per gestire le prenotazioni di case e terreni per campi scout.
Due pannelli (utente e amministrazione), calendario, chat, notifiche live ed email automatiche.

---

## Cosa fa

**Per gli utenti (capi scout)**
- Registrazione e accesso con email e password
- Invio di una richiesta di prenotazione scegliendo la location, il periodo su calendario, con nota obbligatoria (quando si arriva e quando si parte)
- Indicazione di numero persone, tipologia di unità (lupetti/coccinelle, esploratori/guide, clan/fuoco, ALTRO), referente e contatto, provenienza (paese e CAP)
- Richiesta del servizio di trasbordo materiale (50 € a servizio, al giorno)
- Chat diretta con l'amministrazione e notifiche di risposta dentro l'app
- Email automatica di conferma ricezione ("richiesta messa in lavorazione")

**Per l'amministrazione**
- Calendario con tutti i periodi di campo, colorati per location e filtrabili
- Elenco di tutte le richieste con relativo stato
- Gestione stato: ricevuta → in lavorazione → confermata / rifiutata
- Creazione diretta di periodi/blocchi (già confermati)
- Chat con ogni utente e notifiche live di nuove richieste e messaggi
- Segnalazione automatica delle sovrapposizioni di date

### Le location gestite
Avinal Casa · Avinal Basso · Avinal Alto · Avinal Tutto · Ospitale di Cadore · Col Pigner

> **Logica "Avinal":** "Avinal Tutto" occupa l'intero complesso, quindi il sistema
> segnala una sovrapposizione se si accavalla con Casa, Basso o Alto (e viceversa).
> Ospitale di Cadore e Col Pigner sono indipendenti. Le sovrapposizioni vengono
> **segnalate** all'amministrazione, non bloccate: la decisione finale è sempre umana.

---

## Tecnologie

- **Node.js + Express** — server e API
- **PostgreSQL** — database
- **Socket.io** — chat e notifiche in tempo reale
- **Nodemailer** — invio email via SMTP
- Frontend in HTML/CSS/JavaScript, senza framework né passaggi di build

---

## Come pubblicarla su Railway (passo-passo)

Non serve essere programmatori: bastano un account GitHub e uno Railway.

### 1. Carica il progetto su GitHub

1. Crea un nuovo repository su [github.com](https://github.com) (es. `prenotazioni-scout`).
2. Carica tutti i file di questo progetto nel repository.
   - Se usi il sito di GitHub: pulsante **Add file → Upload files**, trascina tutto e conferma con **Commit changes**.

### 2. Crea il progetto su Railway

1. Vai su [railway.app](https://railway.app) e accedi (puoi usare l'account GitHub).
2. **New Project → Deploy from GitHub repo** e scegli il repository appena creato.
3. Railway rileva Node.js e avvia il primo deploy. Attendi che finisca.

### 3. Aggiungi il database PostgreSQL

1. Dentro il progetto Railway: **New → Database → Add PostgreSQL**.
2. Railway crea il database e imposta **automaticamente** la variabile `DATABASE_URL`.
   Non devi copiarla a mano.

### 4. Imposta le variabili d'ambiente

Nel servizio dell'app, apri la scheda **Variables** e aggiungi:

| Variabile        | Valore                                                        |
|------------------|--------------------------------------------------------------|
| `JWT_SECRET`     | una stringa lunga e casuale (vedi sotto come generarla)      |
| `ADMIN_EMAIL`    | `info@cooperativascout.org`                                  |
| `ADMIN_PASSWORD` | una password iniziale per l'admin (cambiala dopo il 1º accesso) |
| `SMTP_HOST`      | `smtp.gmail.com`                                             |
| `SMTP_PORT`      | `465`                                                        |
| `SMTP_USER`      | `info@cooperativascout.org`                                  |
| `SMTP_PASSWORD`  | la "Password per le app" a 16 cifre (vedi sezione Email)     |
| `NODE_ENV`       | `production`                                                 |

> Per generare un `JWT_SECRET` casuale puoi usare un generatore di password online
> impostato su ~48 caratteri, oppure il comando `openssl rand -base64 48` se hai un terminale.

### 5. Genera il dominio pubblico

Nel servizio dell'app: **Settings → Networking → Generate Domain**.
Otterrai un indirizzo tipo `https://prenotazioni-scout.up.railway.app`: è il link dell'app.

### 6. Primo accesso

- Apri il dominio, vai su **Accedi** e usa `ADMIN_EMAIL` + `ADMIN_PASSWORD`.
- Il database e le tabelle vengono creati **da soli** al primo avvio, con le 6 location e l'account admin già pronti.

---

## Configurare l'invio email (Google Workspace)

L'account `info@cooperativascout.org` è su Google Workspace. Per inviare email via SMTP
serve una **Password per le app**, non la password normale.

1. Accedi all'account Google `info@cooperativascout.org`.
2. Attiva la **verifica in due passaggi** (se non è già attiva):
   `Account Google → Sicurezza → Verifica in due passaggi`.
3. Vai su **[myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)**.
4. Crea una nuova password per l'app (nome a piacere, es. "Prenotazioni Scout").
5. Google mostra una password di **16 cifre**: copiala (senza spazi) e incollala
   nella variabile `SMTP_PASSWORD` su Railway.

> Se `SMTP_USER` e `SMTP_PASSWORD` non sono impostate, l'app funziona lo stesso ma
> le email vengono solo registrate nei log invece di essere inviate: comodo per fare prove.

---

## Avvio in locale (facoltativo, per sviluppo)

Serve Node.js 18+ e un PostgreSQL locale.

```bash
# 1. Installa le dipendenze
npm install

# 2. Copia il file di esempio e compila i valori
cp .env.example .env
#   (apri .env e inserisci DATABASE_URL, JWT_SECRET, ecc.)

# 3. Inizializza il database (crea tabelle, location e admin)
npm run init-db

# 4. Avvia
npm start
```

L'app sarà su `http://localhost:3000`.

---

## Sicurezza — cosa fare subito

- **Cambia la password dell'admin** dopo il primo accesso.
- Tieni segreto il `JWT_SECRET`: non condividerlo e non inserirlo nel codice.
- Non caricare mai il file `.env` su GitHub (è già escluso da `.gitignore`).

---

## Struttura del progetto

```
scout-app/
├── src/
│   ├── server.js              # server principale
│   ├── config/
│   │   ├── db.js              # connessione database
│   │   ├── initDb.js          # creazione tabelle + admin + location
│   │   ├── mailer.js          # invio email e template
│   │   └── locationLogic.js   # logica conflitti Avinal
│   ├── middleware/
│   │   └── auth.js            # autenticazione (JWT)
│   └── routes/
│       ├── auth.js            # registrazione / login
│       ├── prenotazioni.js    # prenotazioni e stati
│       ├── chat.js            # messaggi
│       └── notifiche.js       # notifiche
├── public/                    # frontend (interfaccia)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── api.js
│       ├── calendario.js
│       └── app.js
├── package.json
├── railway.json
├── .env.example
└── .gitignore
```

---

## Idee per il futuro (non incluse in questa versione)

- Riepilogo automatico dei costi (persone + trasbordo) in una scheda
- Esportazione delle prenotazioni in PDF o Excel
- Promemoria email prima dell'arrivo
- Possibilità per l'admin di modificare i dettagli di una prenotazione esistente
