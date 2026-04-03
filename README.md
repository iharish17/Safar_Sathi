# Safar Sathi

## 📖 Description

Safar Sathi is a train recovery and passenger protection app. It helps users search trains, inspect route details, check whether they can still catch a missed train, and send a TTE request to protect the passenger from being marked no-show.

## 🚀 Features

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
- Backend: Node.js, Express, Socket.IO, CORS
- Data: local JSON files and mock PNR records

## 📂 Project Structure

```text
Safar_Sathi/
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
│   │   ├── styles/
│   │   └── utils/
│   └── public/
└── README.md
```

## ⚙️ Installation & Setup

### Prerequisites

- Node.js 18 or newer
- npm

### Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### Run the app

Start the backend server:

```bash
cd backend
npm run dev
```

Start the frontend in a separate terminal:

```bash
cd frontend
npm run dev
```

## 🔄 How It Works

1. Open the landing page and choose train recovery or train search.
2. Search for a train or open a train detail page.
3. Enter your PNR and missed station in the missed-train calculator.
4. Review whether the train can still be caught and inspect alternate trains.
5. Send the TTE request if you need boarding protection.
6. Approve the request from the TTE dashboard and scan the generated QR code.

## 📸 Screenshots

Add screenshots here to show the landing page, train search, missed-train calculator, TTE dashboard, and catch pass view.

## 🔮 Future Improvements

- Connect to live railway data instead of mock data.
- Persist TTE requests in a database.
- Improve route and catch prediction accuracy.
- Add authentication for passenger and TTE accounts.
- Add deployment-specific environment configuration.

## 🤝 Contributing

Contributions are welcome. If you want to improve the project, fork the repository, create a feature branch, make your changes, and open a pull request.

## 📄 License

This project does not currently include a license file. Add one before distributing or open-sourcing the application.
