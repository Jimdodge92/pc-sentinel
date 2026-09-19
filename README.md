# PC Sentinel 🛡️
> Intelligent Windows Hardware, Crash & System Diagnostics Tool

**PC Sentinel** is a local diagnostic application and dashboard for Windows that continuously monitors system crashes, unexpected shutdowns, GPU/display anomalies, thermal throttling, and drive health. When an event occurs, PC Sentinel bypasses cryptic Windows hex codes (BugCheck codes, Event IDs, WHEA errors) and immediately tells you:

1. **What Happened** (in clear, plain English)
2. **Why It Happened** (likely physical or software root causes)
3. **How to Fix It** (step-by-step interactive remediation checklist)

---

## 🔍 Diagnostic Capabilities

| Category | Real-World Event | Detection Mechanism | Plain-English Analysis |
| :--- | :--- | :--- | :--- |
| **Abrupt Power Cuts** | PC turns off instantly with no warning | Event 41 (`Kernel-Power`) with `BugcheckCode: 0` | Distinguishes between wall power loss, PSU over-current trip, loose cable, or manual hard-reset. |
| **Blue Screens (BSOD)** | System crashes with blue screen | Event 1001 (`BugCheck`) & Event 41 | Extracts BugCheck code (e.g. `0x116 VIDEO_TDR`, `0x124 WHEA_UNCORRECTABLE`, `0x1A MEMORY_MANAGEMENT`) and names the faulting driver. |
| **GPU Glitches & Seating** | Monitor loses signal, flickers, or driver crashes | Event 4101 (TDR), WHEA PCIe Bus Errors, Device Manager Code 43/45 | Flags GPU sag, unseated PCIe card, loose 12VHPWR/8-pin cable, or corrupted display drivers. |
| **Thermal & Power Throttling** | Heavy stutters or sudden frame drops | Event 37 (`Kernel-Processor-Power`) | Alerts when system firmware clamps CPU clock speeds due to cooler failure, dry paste, or dust. |
| **Storage & Drive Failure** | Drive freezes or files corrupt | SMART reliability counters, disk timeouts (`storahci`/`nvme` Event 153) | Monitors SSD wear %, temperature, reallocated sectors, and warns before complete drive failure. |
| **Out-of-Memory (OOM)** | Applications crash or close spontaneously | Event 2004 (`Resource-Exhaustion-Detector`) | Pinpoints the exact program leaking memory or exhausting the Windows commit limit. |

---

## 🏗️ Architecture

```
pc-sentinel/
├── server/                       # Node.js Express API & Diagnostic Engine
│   ├── index.js                  # API endpoints (/api/diagnostics, /api/system-summary)
│   ├── diagnostics/
│   │   └── incidentEngine.js     # Rule engine mapping events to plain English
│   ├── knowledgeBase/
│   │   ├── bugcheckCodes.json    # BugCheck hex database & fix guides
│   │   └── eventSolutions.json   # Event ID remediation guides
│   └── scripts/                  # High-performance PowerShell collectors
│       ├── get-system-events.ps1
│       ├── get-device-status.ps1
│       ├── get-storage-reliability.ps1
│       └── get-system-summary.ps1
└── client/                       # React 18 + Vite + Tailwind CSS UI
    ├── src/
    │   ├── components/
    │   │   ├── StatusHeader.jsx  # System health gauge & quick specs
    │   │   ├── MetricsBar.jsx    # Shutdown counts, storage status, RAM load
    │   │   ├── IncidentCard.jsx  # Incident feed with severity badges
    │   │   ├── DiagnosisModal.jsx# Full diagnosis, root cause & fix checklist
    │   │   └── HardwareStatusCard.jsx # GPU, monitors, storage volumes
    │   └── App.jsx
```

---

## 🚀 Quick Start

### 1. Start the Server
```powershell
cd server
npm install
npm start
```
The server will start at `http://localhost:3500`.

### 2. Start the Frontend
```powershell
cd client
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🔗 Syncing to GitHub

To push this project to a new GitHub repository:

1. Create a new repository on [GitHub](https://github.com/new) (e.g. named `pc-sentinel`). Do **not** initialize it with a README or license.
2. In your terminal at the root of `pc-sentinel`, run:
```powershell
git remote add origin https://github.com/YOUR_USERNAME/pc-sentinel.git
git add .
git commit -m "Initial commit: PC Sentinel Diagnostic Tool"
git push -u origin main
```

---

## 🔒 Privacy & Security
All telemetry inspection is **100% local**. No logs, event data, or system specs ever leave your machine.
