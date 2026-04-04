# Safar Sathi

## 📖 Description

Safar Sathi is a train recovery and passenger protection app. It helps users search trains, inspect route details, check whether they can still catch a missed train, and send a TTE request to protect the passenger from being marked no-show.

## 🚀 Features (Working on these)

- Search trains by number, train name, or station.
- View complete train details and route information.
- Check if a missed train can still be caught from a later station.
- Suggest alternate trains and highlight the best catch option.
- Send a live TTE boarding request through Socket.IO.
- Generate a catch pass QR code after approval.
- Show a TTE dashboard for request review and approval.
- Display simulated live train status.
- Look up passenger details from mock PNR data.

## 🛠️ Tech Stack

- Frontend: React, Vite, React Router, Framer Motion, Lucide React, qrcode.react
- Backend: Node.js, Express, Socket.IO (for passenger and tte connection), CORS
- Data: Trains Dataset from Kaggle

## � Installation & Setup

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the backend directory:
```bash
PORT=5000
NODE_ENV=development
```

4. Start the backend server:
```bash
npm start
```
The server will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the frontend directory:
```bash
VITE_API_BASE=http://localhost:5000
```

4. Start the development server:
```bash
npm run dev
```
The frontend will run on `http://localhost:5173`

5. Build for production:
```bash
npm run build
```

### Running the Full App Locally

1. Open two terminal windows/tabs

2. **Terminal 1 - Backend:**
```bash
cd backend
npm start
```

3. **Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Testing Mock Data

Use these PNR numbers to test the app:
- `4928174021` - Train 01211 (BADNERA JN → NASIK ROAD)
- `5475698745` - Train 18102 (JAMMU TAWI - JAT → TATANAGAR JN)
- `1234567890` - Train 01209 (NAGPUR → PUNE JN)


### Deployment

**Backend Deployment (Render, Railway, or Fly.io):**
1. Push your code to GitHub
2. Connect your repository to your hosting platform
3. Set environment variables in the platform dashboard
4. Deploy with build command: `npm install` and start command: `npm start`

**Frontend Deployment (Vercel):**
1. Push your code to GitHub
2. Connect your repository to Vercel
3. Set `VITE_API_BASE` environment variable to your deployed backend URL
4. Vercel will auto-build and deploy on each push

## �📂 Project Structure (Final)

```text
safarsathi/
├── backend/
│   ├── data/
│   ├── routes/
│   ├── socket/
│   └── utils/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/  
│   │   └── styles/
│   └── public/
└── README.md
```

## 🔄 Workflow of the app

1. Open the landing page and choose train recovery or train search.
2. Search for a train or open a train detail page.
3. Enter your PNR and missed station in the missed-train calculator.
4. Review whether the train can still be caught and inspect alternate trains.
5. Send the TTE request if you need boarding protection.
6. Approve the request from the TTE dashboard and scan the generated QR code.