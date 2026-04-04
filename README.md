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

## 📂 Project Structure (Final)

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