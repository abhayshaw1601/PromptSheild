"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// Helper SVG icons
const ShieldIcon = ({ className = "w-5 h-5", stroke = "currentColor", fill = "none" }) => (
  <svg className={className} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const LockIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ChevronRight = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ArrowLeft = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const BarChartIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const GearIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const TrashIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const CalendarIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const EyeOffIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const VerifiedCheckIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#00d4ff"/>
  </svg>
);

// Custom Brand SVGs
const ChatGPTLogo = () => (
  <div className="w-9 h-9 rounded-lg bg-[#10a37f]/20 flex items-center justify-center border border-[#10a37f]/30 shrink-0 text-[#10a37f]">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 16.5c-1.5-1.2-2.5-3-2.5-5 0-3.3 2.7-6 6-6h9M19.5 7.5c1.5 1.2 2.5 3 2.5 5 0 3.3-2.7 6-6 6h-9" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  </div>
);

const GeminiLogo = () => (
  <div className="w-9 h-9 rounded-lg bg-[#38bdf8]/20 flex items-center justify-center border border-[#38bdf8]/30 shrink-0 text-[#38bdf8]">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v18M3 12h18M12 12l6.36-6.36M12 12l-6.36 6.36M12 12l6.36 6.36M12 12l-6.36-6.36" />
    </svg>
  </div>
);

const ClaudeLogo = () => (
  <div className="w-9 h-9 rounded-lg bg-[#d97706]/20 flex items-center justify-center border border-[#d97706]/30 shrink-0 text-[#d97706]">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  </div>
);

const NotionLogo = () => (
  <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center border border-white/20 shrink-0 text-white">
    <span className="font-bold text-sm">N</span>
  </div>
);

const SlackLogo = () => (
  <div className="w-9 h-9 rounded-lg bg-[#e01e5a]/20 flex items-center justify-center border border-[#e01e5a]/30 shrink-0 text-[#e01e5a]">
    <span className="font-bold text-sm">S</span>
  </div>
);

// Initial Activity logs data
const INITIAL_LOGS = [
  {
    id: "log_1",
    platform: "ChatGPT",
    severity: "High",
    timeText: "2 mins ago",
    timestamp: "May 18, 2025 at 10:24 AM",
    description: "Detected 3 sensitive items",
    wasRedacted: true,
    sourceUrl: "chat.openai.com",
    requestId: "req_8f2d7a19c4b6",
    tags: ["🔑 API Key", "✉ Email", "🪪 SSN"],
    tagDetails: [
      { name: "API Key", risk: "High Risk" },
      { name: "Email Address", risk: "Medium Risk" },
      { name: "SSN", risk: "High Risk" }
    ]
  },
  {
    id: "log_2",
    platform: "Gemini",
    severity: "Medium",
    timeText: "5 mins ago",
    timestamp: "May 18, 2025 at 10:21 AM",
    description: "Detected 2 sensitive items",
    wasRedacted: true,
    sourceUrl: "gemini.google.com",
    requestId: "req_a72c1a82d0f3",
    tags: ["🗄 DB Credentials", "✉ Email"],
    tagDetails: [
      { name: "DB Credentials", risk: "High Risk" },
      { name: "Email Address", risk: "Medium Risk" }
    ]
  },
  {
    id: "log_3",
    platform: "Claude",
    severity: "Low",
    timeText: "8 mins ago",
    timestamp: "May 18, 2025 at 10:18 AM",
    description: "Detected 1 sensitive item",
    wasRedacted: true,
    sourceUrl: "claude.ai",
    requestId: "req_bf18d4512e92",
    tags: ["✉ Email"],
    tagDetails: [
      { name: "Email Address", risk: "Medium Risk" }
    ]
  },
  {
    id: "log_4",
    platform: "Notion AI",
    severity: "Medium",
    timeText: "15 mins ago",
    timestamp: "May 18, 2025 at 10:11 AM",
    description: "Detected 2 sensitive items",
    wasRedacted: true,
    sourceUrl: "notion.so",
    requestId: "req_fd9a3341ab78",
    tags: ["📞 Phone Number", "✉ Email"],
    tagDetails: [
      { name: "Phone Number", risk: "Low Risk" },
      { name: "Email Address", risk: "Medium Risk" }
    ]
  },
  {
    id: "log_5",
    platform: "Slack AI",
    severity: "Low",
    timeText: "22 mins ago",
    timestamp: "May 18, 2025 at 10:04 AM",
    description: "Detected 1 sensitive item",
    wasRedacted: true,
    sourceUrl: "slack.com",
    requestId: "req_4cf7c3b123aa",
    tags: ["✉ Email"],
    tagDetails: [
      { name: "Email Address", risk: "Medium Risk" }
    ]
  }
];

export default function DemoPlayground() {
  // Shared States
  const [gatewayOnline, setGatewayOnline] = useState(true);
  const [stats, setStats] = useState({
    total: 837,
    apiKeys: 83,
    phi: 77,
    financial: 82,
    pii: 122,
    credentials: 20
  });
  
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [selectedLog, setSelectedLog] = useState<typeof INITIAL_LOGS[0] | null>(INITIAL_LOGS[0]);
  const [activeScreen, setActiveScreen] = useState<"home" | "activity" | "analytics" | "details">("home");
  const [activeFilter, setActiveFilter] = useState<"All" | "High" | "Medium" | "Low">("All");

  // Controls Handlers
  const handleToggleGateway = () => {
    setGatewayOnline(prev => !prev);
  };

  const handleResetStats = () => {
    if (confirm("Reset all PromptShield statistics?")) {
      setStats({
        total: 0,
        apiKeys: 0,
        phi: 0,
        financial: 0,
        pii: 0,
        credentials: 0
      });
      setLogs([]);
      setSelectedLog(null);
    }
  };

  const handleSimulateLeak = (platform: "ChatGPT" | "Gemini" | "Claude") => {
    const isChatGPT = platform === "ChatGPT";
    const isGemini = platform === "Gemini";
    
    let simulatedTags: string[] = [];
    let simulatedDetails: { name: string; risk: string }[] = [];
    let severity: "High" | "Medium" | "Low" = "Low";
    
    if (isChatGPT) {
      simulatedTags = ["🔑 API Key", "✉ Email", "🪪 SSN"];
      simulatedDetails = [
        { name: "API Key", risk: "High Risk" },
        { name: "Email Address", risk: "Medium Risk" },
        { name: "SSN", risk: "High Risk" }
      ];
      severity = "High";
    } else if (isGemini) {
      simulatedTags = ["🗄 DB Credentials", "✉ Email"];
      simulatedDetails = [
        { name: "DB Credentials", risk: "High Risk" },
        { name: "Email Address", risk: "Medium Risk" }
      ];
      severity = "Medium";
    } else {
      simulatedTags = ["✉ Email"];
      simulatedDetails = [
        { name: "Email Address", risk: "Medium Risk" }
      ];
      severity = "Low";
    }

    const fieldCount = simulatedTags.length;
    const newLog = {
      id: `log_${Date.now()}`,
      platform,
      severity,
      timeText: "Just now",
      timestamp: new Date().toLocaleString(),
      description: `Detected ${fieldCount} sensitive item${fieldCount > 1 ? "s" : ""}`,
      wasRedacted: true,
      sourceUrl: isChatGPT ? "chat.openai.com" : isGemini ? "gemini.google.com" : "claude.ai",
      requestId: `req_${Math.random().toString(16).slice(2, 14)}`,
      tags: simulatedTags,
      tagDetails: simulatedDetails
    };

    setLogs(prev => [newLog, ...prev]);
    setSelectedLog(newLog);
    setStats(prev => {
      let addKeys = 0, addPhi = 0, addFin = 0, addPii = 0, addCreds = 0;
      simulatedDetails.forEach(d => {
        if (d.name.includes("API")) addKeys++;
        else if (d.name.includes("SSN")) addPhi++;
        else if (d.name.includes("Email")) addPii++;
        else if (d.name.includes("Credentials")) addCreds++;
      });
      
      return {
        total: prev.total + fieldCount,
        apiKeys: prev.apiKeys + addKeys,
        phi: prev.phi + addPhi,
        financial: prev.financial + addFin,
        pii: prev.pii + addPii,
        credentials: prev.credentials + addCreds
      };
    });

    // Automatically navigate to activity/details if user wants to see it
    setActiveScreen("activity");
  };

  // Filter logic for Screen 2
  const filteredLogs = useMemo(() => {
    if (activeFilter === "All") return logs;
    return logs.filter(l => l.severity === activeFilter);
  }, [logs, activeFilter]);

  // Counts for pills
  const counts = useMemo(() => {
    return {
      all: logs.length,
      high: logs.filter(l => l.severity === "High").length,
      medium: logs.filter(l => l.severity === "Medium").length,
      low: logs.filter(l => l.severity === "Low").length,
    };
  }, [logs]);

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#f0f6fc] font-sans antialiased overflow-x-hidden pb-16">
      
      {/* ── Navbar ── */}
      <nav className="border-b border-[#21262d] bg-[#161b22]/70 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xl font-bold flex items-center gap-2 hover:opacity-90 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#ff8c00] to-[#00d4ff] flex items-center justify-center border border-[#ff8c00]/40 shadow-glow">
                <ShieldIcon className="w-5 h-5 text-white" fill="none" stroke="currentColor" />
              </div>
              <span>PromptShield<span className="text-[#00d4ff]">&copy;</span></span>
            </Link>
            <span className="bg-[#1c2128] border border-[#21262d] text-xs font-semibold px-2.5 py-1 rounded-full text-[#8b949e]">
              Design Playground
            </span>
          </div>
          <Link href="/" className="text-sm font-medium text-[#00d4ff] hover:underline flex items-center gap-1.5 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Landing Page
          </Link>
        </div>
      </nav>

      {/* ── Main Layout ── */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        
        {/* Intro */}
        <div className="mb-10 text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-[#f0f6fc] to-[#00d4ff] bg-clip-text text-transparent">
            Interactive Product Prototypes
          </h2>
          <p className="mt-3 text-base text-[#8b949e] leading-relaxed">
            Test and view the PromptShield Mobile App screens and Chrome Extension popup below. Toggle gateway status, simulate prompt leaks, and switch views to see the premium dark-themed design system in action.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* ────────────────────────────────────────────────────────
              COLUMN 1: SMARTPHONE SIMULATOR (4 Columns)
              ──────────────────────────────────────────────────────── */}
          <div className="lg:col-span-4 flex flex-col items-center">
            <div className="text-sm font-bold text-[#8b949e] uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse"></span>
              PromptShield Mobile App
            </div>

            {/* Smartphone Outer Shell */}
            <div className="w-[390px] h-[812px] bg-[#000000] rounded-[52px] border-[12px] border-[#1f242c] shadow-[0_24px_60px_-15px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col p-1.5 select-none ring-1 ring-white/10">
              
              {/* Device Bezel & Notch Details */}
              <div className="absolute top-0 inset-x-0 h-8 flex justify-center z-50 pointer-events-none">
                <div className="w-40 h-[18px] bg-[#1f242c] rounded-b-2xl flex items-center justify-between px-6">
                  {/* Speaker Grill */}
                  <div className="w-14 h-1 bg-[#101318] rounded-full mx-auto" />
                  {/* Camera hole */}
                  <div className="w-2.5 h-2.5 bg-[#101318] rounded-full" />
                </div>
              </div>

              {/* Status Bar */}
              <div className="flex justify-between items-center px-6 pt-3 pb-1 text-[11px] font-bold text-white/90 z-40 bg-[#0d1117]">
                <span>9:41</span>
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" />
                  </svg>
                  <span>LTE</span>
                  <div className="w-5 h-2.5 border border-white/80 rounded-sm p-0.5 flex items-center">
                    <div className="w-3.5 h-full bg-white rounded-2xs" />
                  </div>
                </div>
              </div>

              {/* Smartphone Display (Scrollable viewport) */}
              <div className="flex-1 bg-[#0d1117] overflow-y-auto overflow-x-hidden relative flex flex-col justify-between rounded-[40px] text-[#f0f6fc]">
                
                {/* ── Screen Renderers ── */}
                <div className="flex-1 p-5 pb-24 overflow-y-auto">
                  
                  {/* SCREEN 1: HOME / DASHBOARD */}
                  {activeScreen === "home" && (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                      
                      {/* App Header */}
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-blue-600/20 flex items-center justify-center border border-blue-500/30 text-blue-400">
                            <ShieldIcon className="w-5 h-5" fill="none" stroke="currentColor" />
                          </div>
                          <div>
                            <h3 className="font-bold text-[15px] leading-tight flex items-center gap-1">
                              PromptShield
                            </h3>
                            <p className="text-[10px] text-[#8b949e] font-medium leading-none">AI Data Loss Prevention</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[9px] font-bold text-[#8b949e] border border-[#21262d] px-2 py-0.5 rounded-full bg-[#161b22]">
                            v1.0.0
                          </span>
                          <button className="text-[#8b949e] hover:text-white transition-colors">
                            <GearIcon className="w-4 h-4" />
                          </button>
                          <button className="text-[#8b949e] hover:text-white transition-colors font-bold text-base leading-none pb-1">
                            ⋮
                          </button>
                        </div>
                      </div>

                      {/* Status Card (Glowing green checkmark shield) */}
                      <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-5 mb-4 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-2xl rounded-full pointer-events-none" />
                        <div className="flex items-start gap-4">
                          {/* Glowing Icon */}
                          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-[#00ff88] relative shrink-0 shadow-[0_0_20px_rgba(0,255,136,0.15)]">
                            <div className="absolute inset-0.5 rounded-full border border-emerald-500/20 animate-ping opacity-35" />
                            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </div>
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-[18px] text-[#00ff88]">Protected</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] inline-block animate-pulse"></span>
                            </div>
                            <div className="text-xs font-semibold text-emerald-400 mt-0.5">Monitoring Active</div>
                            <p className="text-xs text-[#8b949e] mt-2 font-medium leading-relaxed">
                              All prompts are protected and sensitive data is blocked.
                            </p>
                          </div>
                        </div>

                        <div className="border-t border-[#21262d] mt-4 pt-3 flex justify-between items-center text-[11px] font-semibold text-[#8b949e]">
                          <span className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            Last checked: 2 mins ago
                          </span>
                          <button onClick={() => setActiveScreen("activity")} className="text-[#00d4ff] hover:underline flex items-center gap-0.5">
                            View details <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Stats Card */}
                      <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-5 mb-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                            <BarChartIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-2xl font-black text-white leading-none font-mono">
                              {stats.total}
                            </div>
                            <div className="text-[11px] text-[#8b949e] font-semibold mt-1">Items Protected</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="bg-[#00ff88]/10 text-[#00ff88] text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                            <span>↑ 12%</span>
                          </div>
                          <div className="text-[10px] text-[#8b949e] font-medium mt-1">vs this week</div>
                        </div>
                      </div>

                      {/* Recent Activity Section */}
                      <div className="mb-5">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-extrabold text-[14px]">Recent Activity</h4>
                          <button onClick={() => setActiveScreen("activity")} className="text-xs font-bold text-[#00d4ff] hover:underline">
                            View all
                          </button>
                        </div>

                        {/* List Items */}
                        <div className="space-y-2.5">
                          {logs.slice(0, 3).map((item) => (
                            <div 
                              key={item.id} 
                              onClick={() => {
                                setSelectedLog(item);
                                setActiveScreen("details");
                              }}
                              className="bg-[#161b22] border border-[#21262d] rounded-xl p-3.5 flex items-center justify-between hover:border-[#8b949e]/30 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                {item.platform === "ChatGPT" && <ChatGPTLogo />}
                                {item.platform === "Gemini" && <GeminiLogo />}
                                {item.platform === "Claude" && <ClaudeLogo />}
                                {item.platform === "Notion AI" && <NotionLogo />}
                                {item.platform === "Slack AI" && <SlackLogo />}
                                
                                <div>
                                  <div className="font-bold text-xs flex items-center gap-1.5">
                                    <span>{item.platform}</span>
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      item.severity === "High" ? "bg-[#ff4444]" :
                                      item.severity === "Medium" ? "bg-[#ff8c00]" : "bg-[#00ff88]"
                                    }`} />
                                  </div>
                                  <div className="text-[10px] text-[#8b949e] font-medium mt-0.5">{item.description}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] font-bold text-[#8b949e]">
                                <span>{item.timeText}</span>
                                <ChevronRight className="w-3 h-3 text-[#8b949e]/60" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Full-width CTA button */}
                      <button 
                        onClick={() => setActiveScreen("analytics")}
                        className="w-full bg-blue-950/20 border border-blue-500/40 text-blue-400 hover:bg-blue-950/40 hover:border-blue-400/60 font-bold py-3.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        📊 View Analytics ›
                      </button>

                    </motion.div>
                  )}

                  {/* SCREEN 2: RECENT ACTIVITY LIST */}
                  {activeScreen === "activity" && (
                    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                      
                      {/* Back bar */}
                      <div className="flex items-center justify-between mb-4">
                        <button onClick={() => setActiveScreen("home")} className="text-[#8b949e] hover:text-white transition-colors flex items-center gap-1">
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <span className="font-bold text-[14px]">Recent Activity</span>
                        <button className="text-[#8b949e] hover:text-white">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                          </svg>
                        </button>
                      </div>

                      <div className="mb-4">
                        <h3 className="text-[16px] font-black">Recent Activity</h3>
                        <p className="text-[10px] text-[#8b949e] font-semibold mt-0.5">Latest events detected by PromptShield</p>
                      </div>

                      {/* Filters Pills */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-3 scrollbar-none mb-3">
                        <button 
                          onClick={() => setActiveFilter("All")}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 shrink-0 transition-colors ${
                            activeFilter === "All" ? "bg-blue-600 border border-blue-500 text-white" : "bg-[#161b22] border border-[#21262d] text-[#8b949e] hover:text-white"
                          }`}
                        >
                          All <span className="bg-black/30 px-1.5 py-0.2 rounded-full font-mono text-[9px]">{counts.all}</span>
                        </button>
                        <button 
                          onClick={() => setActiveFilter("High")}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 shrink-0 transition-colors ${
                            activeFilter === "High" ? "bg-[#ff4444]/20 border border-[#ff4444]/50 text-[#ff4444]" : "bg-[#161b22] border border-[#21262d] text-[#8b949e] hover:text-white"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#ff4444]" /> High <span className="font-mono text-[9px] opacity-70">{counts.high}</span>
                        </button>
                        <button 
                          onClick={() => setActiveFilter("Medium")}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 shrink-0 transition-colors ${
                            activeFilter === "Medium" ? "bg-[#ff8c00]/20 border border-[#ff8c00]/50 text-[#ff8c00]" : "bg-[#161b22] border border-[#21262d] text-[#8b949e] hover:text-white"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#ff8c00]" /> Medium <span className="font-mono text-[9px] opacity-70">{counts.medium}</span>
                        </button>
                        <button 
                          onClick={() => setActiveFilter("Low")}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 shrink-0 transition-colors ${
                            activeFilter === "Low" ? "bg-[#00ff88]/20 border border-[#00ff88]/50 text-[#00ff88]" : "bg-[#161b22] border border-[#21262d] text-[#8b949e] hover:text-white"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" /> Low <span className="font-mono text-[9px] opacity-70">{counts.low}</span>
                        </button>
                      </div>

                      {/* Dropdown Week */}
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] font-bold text-[#8b949e]">Filters Applied</span>
                        <div className="text-[10px] font-extrabold text-white bg-[#161b22] border border-[#21262d] px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer">
                          This Week ▾
                        </div>
                      </div>

                      {/* Feed Cards list */}
                      <div className="space-y-3">
                        {filteredLogs.length === 0 ? (
                          <div className="text-center py-8 text-xs text-[#8b949e]">No events match the active filter.</div>
                        ) : (
                          filteredLogs.map(item => (
                            <div 
                              key={item.id}
                              onClick={() => {
                                setSelectedLog(item);
                                setActiveScreen("details");
                              }}
                              className="bg-[#161b22] border border-[#21262d] rounded-2xl p-4 relative hover:border-[#8b949e]/30 transition-colors cursor-pointer flex flex-col gap-2.5"
                            >
                              {/* Left Threat Indicator Ribbon */}
                              <div className={`absolute top-4 left-0 bottom-4 w-[3.5px] rounded-r-md ${
                                item.severity === "High" ? "bg-[#ff4444]" :
                                item.severity === "Medium" ? "bg-[#ff8c00]" : "bg-[#00ff88]"
                              }`} />
                              
                              <div className="flex justify-between items-start pl-1">
                                <div className="flex items-center gap-2">
                                  {item.platform === "ChatGPT" && <ChatGPTLogo />}
                                  {item.platform === "Gemini" && <GeminiLogo />}
                                  {item.platform === "Claude" && <ClaudeLogo />}
                                  {item.platform === "Notion AI" && <NotionLogo />}
                                  {item.platform === "Slack AI" && <SlackLogo />}
                                  
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-xs">{item.platform}</span>
                                      <span className={`text-[9px] font-black px-2 py-0.2 rounded-md ${
                                        item.severity === "High" ? "bg-[#ff4444]/15 text-[#ff4444]" :
                                        item.severity === "Medium" ? "bg-[#ff8c00]/15 text-[#ff8c00]" : "bg-[#00ff88]/15 text-[#00ff88]"
                                      }`}>
                                        {item.severity}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-[#8b949e] font-semibold mt-0.5">{item.description}</div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 text-[10px] font-bold text-[#8b949e]">
                                  <span>{item.timeText}</span>
                                  <ChevronRight className="w-3 h-3" />
                                </div>
                              </div>

                              {/* Tags Chips Row */}
                              <div className="flex flex-wrap gap-1.5 pl-1.5">
                                {item.tags.map((tag, index) => (
                                  <span 
                                    key={index}
                                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#1c2128] border flex items-center gap-1 ${
                                      tag.includes("API") ? "border-[#00d4ff]/30 text-[#00d4ff]" :
                                      tag.includes("DB") ? "border-[#ff8c00]/30 text-[#ff8c00]" :
                                      tag.includes("SSN") ? "border-[#ff4444]/30 text-[#ff4444]" :
                                      tag.includes("Phone") ? "border-[#ff8c00]/30 text-[#ff8c00]" : "border-[#00ff88]/30 text-[#00ff88]"
                                    }`}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>

                            </div>
                          ))
                        )}
                      </div>

                    </motion.div>
                  )}

                  {/* SCREEN 3: ANALYTICS */}
                  {activeScreen === "analytics" && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      
                      {/* Back bar */}
                      <div className="flex items-center justify-between mb-4">
                        <button onClick={() => setActiveScreen("home")} className="text-[#8b949e] hover:text-white transition-colors flex items-center gap-1">
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <span className="font-bold text-[14px]">Protection Analytics</span>
                        <button className="text-[#8b949e] hover:text-white">
                          <CalendarIcon className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mb-4">
                        <h3 className="text-[16px] font-black">Protection Analytics</h3>
                        <p className="text-[10px] text-[#8b949e] font-semibold mt-0.5">Insights about your protected data</p>
                      </div>

                      {/* Time tabs */}
                      <div className="bg-[#161b22] border border-[#21262d] p-1 rounded-xl flex items-center justify-between gap-1 mb-4">
                        <button className="flex-1 text-center py-1.5 rounded-lg text-[10px] font-extrabold bg-blue-600 text-white transition-colors">
                          This Week
                        </button>
                        <button className="flex-1 text-center py-1.5 rounded-lg text-[10px] font-semibold text-[#8b949e] hover:text-white transition-colors">
                          This Month
                        </button>
                        <button className="flex-1 text-center py-1.5 rounded-lg text-[10px] font-semibold text-[#8b949e] hover:text-white transition-colors">
                          This Quarter
                        </button>
                        <button className="flex-1 text-center py-1.5 rounded-lg text-[10px] font-semibold text-[#8b949e] hover:text-white transition-colors">
                          All Time
                        </button>
                      </div>

                      {/* Total Protected Card with Chart */}
                      <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-5 mb-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-[11px] font-bold text-[#8b949e] tracking-wider uppercase">Total Items Protected</div>
                            <div className="text-3xl font-black text-white mt-1 leading-none font-mono">{stats.total}</div>
                            <div className="text-[10px] font-bold text-[#00ff88] mt-2">↑ 12% vs last week (749)</div>
                          </div>
                          <div className="bg-[#00ff88]/10 text-[#00ff88] text-[10px] font-black px-2.5 py-0.5 rounded-full">
                            ↑ 12%
                          </div>
                        </div>

                        {/* Bar Chart Mockup */}
                        <div className="h-24 flex items-end gap-2 pt-6">
                          {[
                            { day: "Mon", h: "h-12" },
                            { day: "Tue", h: "h-10" },
                            { day: "Wed", h: "h-16" },
                            { day: "Thu", h: "h-20" },
                            { day: "Fri", h: "h-18" },
                            { day: "Sat", h: "h-16" },
                            { day: "Sun", h: "h-[72px]" }
                          ].map((item, index) => (
                            <div key={index} className="flex-1 flex flex-col items-center gap-1.5">
                              <div className={`w-full ${item.h} bg-blue-600 rounded-sm hover:bg-[#00d4ff] transition-colors`} />
                              <span className="text-[9px] text-[#8b949e] font-semibold">{item.day}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Category Breakdown */}
                      <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-4 mb-4">
                        <h4 className="text-[11px] font-extrabold text-[#8b949e] tracking-wider uppercase mb-3.5">Protection by Category</h4>
                        
                        <div className="space-y-3.5">
                          {[
                            { name: "PII", val: stats.pii, color: "bg-[#9b59b6]", pct: "14.6%", dir: "↑ 5%", dColor: "text-[#ff4444]" },
                            { name: "API Keys", val: stats.apiKeys, color: "bg-[#00d4ff]", pct: "9.9%", dir: "↓ 8%", dColor: "text-emerald-400" },
                            { name: "PHI / Health", val: stats.phi, color: "bg-[#ff4444]", pct: "9.2%", dir: "↓ 3%", dColor: "text-emerald-400" },
                            { name: "Financial", val: stats.financial, color: "bg-[#00ff88]", pct: "9.8%", dir: "↑ 11%", dColor: "text-[#ff4444]" },
                            { name: "Credentials", val: stats.credentials, color: "bg-[#ff8c00]", pct: "2.4%", dir: "↑ 2%", dColor: "text-[#ff4444]" }
                          ].map((cat, i) => (
                            <div key={i} className="flex items-center justify-between text-xs font-semibold">
                              <span className="w-20 text-[#8b949e]">{cat.name}</span>
                              <span className="font-mono w-8 text-right text-white">{cat.val}</span>
                              <div className="flex-1 mx-3 bg-[#0d1117] h-2.5 rounded-full overflow-hidden border border-[#21262d]">
                                <div className={`h-full ${cat.color}`} style={{ width: `${parseFloat(cat.pct) * 4}%` }} />
                              </div>
                              <span className="text-[10px] text-[#8b949e] w-8 text-right">{cat.pct}</span>
                              <span className={`text-[10px] ${cat.dColor} w-10 text-right`}>{cat.dir}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </motion.div>
                  )}

                  {/* SCREEN 4: ACTIVITY DETAILS */}
                  {activeScreen === "details" && selectedLog && (
                    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                      
                      {/* Back bar */}
                      <div className="flex items-center justify-between mb-4">
                        <button onClick={() => setActiveScreen("activity")} className="text-[#8b949e] hover:text-white transition-colors flex items-center gap-1">
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <span className="font-bold text-[14px]">Activity Details</span>
                        <button className="text-[#8b949e] hover:text-white">
                          ⋮
                        </button>
                      </div>

                      {/* Header App Card */}
                      <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-4 mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {selectedLog.platform === "ChatGPT" && <ChatGPTLogo />}
                          {selectedLog.platform === "Gemini" && <GeminiLogo />}
                          {selectedLog.platform === "Claude" && <ClaudeLogo />}
                          {selectedLog.platform === "Notion AI" && <NotionLogo />}
                          {selectedLog.platform === "Slack AI" && <SlackLogo />}
                          
                          <div>
                            <h4 className="font-bold text-[14px] text-white">{selectedLog.platform}</h4>
                            <p className="text-[10px] text-[#8b949e] font-semibold mt-0.5">{selectedLog.timeText} &bull; {selectedLog.severity}</p>
                          </div>
                        </div>
                        <button className="bg-[#1c2128] border border-[#21262d] text-[10px] font-bold px-3 py-1.5 rounded-lg text-[#00d4ff] hover:opacity-90 transition-opacity">
                          View in activity ›
                        </button>
                      </div>

                      {/* Detected Leaks Card */}
                      <div className="bg-[#161b22] border border-[#ff4444]/25 rounded-2xl p-4.5 mb-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 blur-2xl rounded-full pointer-events-none" />
                        
                        <div className="flex items-start gap-3 text-[#ff4444] mb-3">
                          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <div>
                            <h5 className="font-black text-[13px]">Detected</h5>
                            <p className="text-[10px] text-[#8b949e] font-semibold mt-0.5">{selectedLog.tagDetails.length} sensitive items found in your prompt</p>
                          </div>
                        </div>

                        {/* Leak items details list */}
                        <div className="space-y-3 mt-4 border-t border-[#21262d] pt-3">
                          {selectedLog.tagDetails.map((td, i) => (
                            <div key={i} className="flex justify-between items-center text-xs font-semibold">
                              <div className="flex items-center gap-2">
                                <span className="text-[#ff4444]">🛡</span>
                                <span className="text-white">{td.name}</span>
                                <span className="text-[9px] bg-[#ff4444]/10 text-[#ff4444] px-1.5 py-0.2 rounded-md font-extrabold">{td.risk}</span>
                              </div>
                              <span className="text-[#8b949e] flex items-center gap-1 text-[10px]">
                                <EyeOffIcon className="w-3.5 h-3.5" /> Redacted
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Action taken card */}
                      <div className="bg-[#161b22] border border-[#00ff88]/20 rounded-2xl p-4 mb-4 flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center text-[#00ff88] shrink-0 mt-0.5">
                          ✓
                        </div>
                        <div>
                          <h5 className="font-bold text-[12px] text-white">Action Taken</h5>
                          <p className="text-[11px] text-[#00ff88] font-bold mt-1">Successfully redacted</p>
                          <p className="text-[10px] text-[#8b949e] font-medium leading-relaxed mt-1">
                            Sensitive data was masked before the response was sent.
                          </p>
                        </div>
                      </div>

                      {/* Details block */}
                      <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-4.5 mb-4 text-xs font-semibold">
                        <h5 className="text-[10px] font-extrabold text-[#8b949e] uppercase tracking-wider mb-3">Details</h5>
                        <div className="space-y-2.5">
                          <div className="flex justify-between">
                            <span className="text-[#8b949e]">Date & Time</span>
                            <span className="text-white">{selectedLog.timestamp}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8b949e]">Source</span>
                            <span className="text-blue-400 underline">{selectedLog.sourceUrl}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8b949e]">Request ID</span>
                            <span className="text-white font-mono">{selectedLog.requestId}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8b949e]">Device</span>
                            <span className="text-white">This Device (Local)</span>
                          </div>
                        </div>
                      </div>

                    </motion.div>
                  )}

                </div>

                {/* Sticky Footer Area (Screens 1 & 2 only) */}
                {activeScreen === "home" && (
                  <div className="absolute bottom-12 inset-x-0 bg-[#0d1117] border-t border-[#21262d]/60 px-5 py-3 flex justify-between items-center text-[10px] font-bold text-[#8b949e]">
                    <span className="flex items-center gap-1 text-[#00ff88]">
                      <ShieldIcon className="w-3.5 h-3.5 text-[#00ff88]" fill="none" stroke="currentColor" />
                      Local Shield Active
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] inline-block"></span>
                      v1.0.0
                    </span>
                  </div>
                )}

                {activeScreen === "activity" && (
                  <div className="absolute bottom-12 inset-x-0 bg-[#161b22] border-t border-[#21262d]/60 px-5 py-3.5 flex items-center gap-3 text-[11px] font-medium text-[#8b949e]">
                    <ShieldIcon className="w-4 h-4 text-blue-400 shrink-0" />
                    <p className="leading-tight flex-1">
                      All sensitive data is automatically masked and never leaves your device. <span className="text-[#00d4ff] hover:underline cursor-pointer">Learn more ↗</span>
                    </p>
                  </div>
                )}

                {/* Bottom App Tab Bar (iPhone Tab Bar) */}
                <div className="absolute bottom-0 inset-x-0 h-12 bg-[#161b22] border-t border-[#21262d] flex justify-around items-center px-4 rounded-b-[40px] z-50">
                  <button 
                    onClick={() => setActiveScreen("home")} 
                    className={`flex flex-col items-center gap-0.5 ${activeScreen === "home" ? "text-[#00d4ff]" : "text-[#8b949e] hover:text-white"}`}
                  >
                    <ShieldIcon className="w-4.5 h-4.5" />
                    <span className="text-[8px] font-bold uppercase">Overview</span>
                  </button>
                  <button 
                    onClick={() => setActiveScreen("activity")} 
                    className={`flex flex-col items-center gap-0.5 ${activeScreen === "activity" || activeScreen === "details" ? "text-[#00d4ff]" : "text-[#8b949e] hover:text-white"}`}
                  >
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="text-[8px] font-bold uppercase">Activity</span>
                  </button>
                  <button 
                    onClick={() => setActiveScreen("analytics")} 
                    className={`flex flex-col items-center gap-0.5 ${activeScreen === "analytics" ? "text-[#00d4ff]" : "text-[#8b949e] hover:text-white"}`}
                  >
                    <BarChartIcon className="w-4.5 h-4.5" />
                    <span className="text-[8px] font-bold uppercase">Analytics</span>
                  </button>
                  <button 
                    onClick={() => alert("Settings sheet mock: Configuration loaded locally.")} 
                    className="flex flex-col items-center gap-0.5 text-[#8b949e] hover:text-white"
                  >
                    <GearIcon className="w-4.5 h-4.5" />
                    <span className="text-[8px] font-bold uppercase">Settings</span>
                  </button>
                </div>

              </div>

              {/* iPhone Home Indicator bar */}
              <div className="absolute bottom-1 inset-x-0 h-4 flex justify-center items-center z-50 pointer-events-none">
                <div className="w-32 h-1 bg-white/60 rounded-full" />
              </div>

            </div>
          </div>

          {/* ────────────────────────────────────────────────────────
              COLUMN 2: BROWSER EXTENSION POPUP PREVIEW (4 Columns)
              ──────────────────────────────────────────────────────── */}
          <div className="lg:col-span-4 flex flex-col items-center">
            <div className="text-sm font-bold text-[#8b949e] uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
              Chrome Extension Popup
            </div>

            {/* Popup Container (styled to look like a popup menu from Chrome UI) */}
            <div className="w-[400px] bg-[#161b22] border border-[#21262d] rounded-2xl p-0.5 shadow-2xl relative">
              
              {/* Chrome popup shell header */}
              <div className="bg-[#1c2128] border-b border-[#21262d] px-4 py-2 text-xs flex justify-between items-center rounded-t-2.5xl">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                  <span className="text-[10px] text-[#8b949e] font-semibold ml-2 font-mono">Extension: PromptShield</span>
                </div>
                <div className="text-[#8b949e] font-mono text-[9px]">400x530px</div>
              </div>

              {/* Real Popup HTML */}
              <div className="bg-[#0d1117] p-4 text-[#f0f6fc] text-xs flex flex-col gap-3 rounded-b-2xl font-sans relative">
                
                {/* Background glow in extension */}
                <div className="absolute top-0 inset-x-0 h-28 bg-gradient-to-b from-[#00d4ff]/5 to-transparent pointer-events-none" />

                {/* Header */}
                <header className="flex items-center justify-between z-10 relative">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-orange-500/10 to-[#00d4ff]/5 border border-orange-500/40 flex items-center justify-center shadow-glow">
                      <ShieldIcon className="w-5 h-5 text-orange-500" strokeWidth={2} />
                    </div>
                    <div>
                      <div className="font-extrabold text-[15px] leading-tight flex items-center gap-1 text-[#f0f6fc]">
                        PromptShield
                        <VerifiedCheckIcon className="w-3.5 h-3.5 text-[#00d4ff] inline-block" />
                      </div>
                      <div className="text-[9px] text-[#8b949e] font-medium leading-none mt-0.5">AI Data Loss Prevention</div>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold text-[#8b949e] border border-[#21262d] px-2 py-0.5 rounded-full bg-[#161b22]">
                    v1.0.0
                  </span>
                </header>

                {/* Gateway Status bar */}
                <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-3 flex justify-between items-center z-10 relative">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${gatewayOnline ? "bg-[#00ff88] shadow-[0_0_8px_#00ff88]" : "bg-[#ff4444] shadow-[0_0_8px_#ff4444]"}`} />
                    <div>
                      <div className="text-[9px] font-extrabold text-[#8b949e] tracking-widest leading-none">GATEWAY</div>
                      <div className={`text-[12px] font-black mt-1 ${gatewayOnline ? "text-[#00ff88]" : "text-[#ff4444]"}`}>
                        {gatewayOnline ? "SHIELD SECURED" : "GATEWAY OFFLINE"}
                      </div>
                    </div>
                  </div>
                  <label className="relative inline-block w-11 h-6 cursor-pointer">
                    <input type="checkbox" checked={gatewayOnline} onChange={handleToggleGateway} className="sr-only peer" />
                    <div className="w-11 h-6 bg-[#21262d] border border-[#30363d] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-[#8b949e] peer-checked:after:bg-[#00d4ff] after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00d4ff]/15 peer-checked:border-[#00d4ff]"></div>
                  </label>
                </div>

                {/* Stats grid */}
                <div className="z-10 relative">
                  <div className="text-[9px] font-extrabold text-[#8b949e] tracking-wider uppercase mb-1.5">Protection Summary</div>
                  
                  <div className="grid grid-cols-6 gap-2">
                    {/* Row 1: Large Card */}
                    <div className="col-span-6 bg-[#161b22] border border-[#00d4ff]/25 rounded-xl p-4 flex justify-between items-center">
                      <div className="text-[12px] text-white font-bold">Total Redacted</div>
                      <div className="text-2xl font-black text-[#00d4ff] font-mono leading-none">{stats.total}</div>
                    </div>

                    {/* Row 2: 3 stat tiles */}
                    <div className="col-span-2 bg-[#161b22] border border-[#00d4ff]/15 rounded-xl p-2.5 text-center flex flex-col justify-center min-h-[64px]">
                      <div className="text-base font-extrabold text-[#00d4ff] font-mono leading-none">{stats.apiKeys}</div>
                      <div className="text-[9px] text-[#8b949e] font-semibold mt-1">API Keys</div>
                    </div>
                    <div className="col-span-2 bg-[#161b22] border border-[#ff4444]/15 rounded-xl p-2.5 text-center flex flex-col justify-center min-h-[64px]">
                      <div className="text-base font-extrabold text-[#ff4444] font-mono leading-none">{stats.phi}</div>
                      <div className="text-[9px] text-[#8b949e] font-semibold mt-1">PHI / Health</div>
                    </div>
                    <div className="col-span-2 bg-[#161b22] border border-[#00ff88]/15 rounded-xl p-2.5 text-center flex flex-col justify-center min-h-[64px]">
                      <div className="text-base font-extrabold text-[#00ff88] font-mono leading-none">{stats.financial}</div>
                      <div className="text-[9px] text-[#8b949e] font-semibold mt-1">Financial</div>
                    </div>

                    {/* Row 3: 2 stat tiles */}
                    <div className="col-span-3 bg-[#161b22] border border-[#9b59b6]/15 rounded-xl p-2.5 text-center flex flex-col justify-center min-h-[64px]">
                      <div className="text-base font-extrabold text-[#9b59b6] font-mono leading-none">{stats.pii}</div>
                      <div className="text-[9px] text-[#8b949e] font-semibold mt-1">PII</div>
                    </div>
                    <div className="col-span-3 bg-[#161b22] border border-[#ff8c00]/15 rounded-xl p-2.5 text-center flex flex-col justify-center min-h-[64px]">
                      <div className="text-base font-extrabold text-[#ff8c00] font-mono leading-none">{stats.credentials}</div>
                      <div className="text-[9px] text-[#8b949e] font-semibold mt-1">Credentials</div>
                    </div>
                  </div>
                </div>

                {/* Recent activity list */}
                <div className="z-10 relative">
                  <div className="text-[9px] font-extrabold text-[#8b949e] tracking-wider uppercase mb-1.5">Recent Activity</div>
                  
                  <div className="bg-[#161b22] border border-[#21262d] rounded-xl max-h-[148px] overflow-y-auto divide-y divide-[#21262d]">
                    {logs.length === 0 ? (
                      <div className="text-center py-6 text-[11px] text-[#8b949e] font-semibold">No activity yet</div>
                    ) : (
                      logs.slice(0, 3).map((item) => (
                        <div key={item.id} className="p-2.5 flex items-center gap-3 hover:bg-[#1c2128] transition-colors cursor-pointer">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-extrabold text-white text-[11px] text-left">{item.platform}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.tags.map((t, idx) => (
                                <span 
                                  key={idx} 
                                  className={`text-[8px] font-extrabold px-1.5 py-0.2 rounded-full bg-[#0d1117] border ${
                                    t.includes("API") ? "border-[#00d4ff]/30 text-[#00d4ff]" :
                                    t.includes("DB") ? "border-[#ff8c00]/30 text-[#ff8c00]" :
                                    t.includes("SSN") ? "border-[#ff4444]/30 text-[#ff4444]" :
                                    t.includes("Phone") ? "border-[#ff8c00]/30 text-[#ff8c00]" : "border-[#00ff88]/30 text-[#00ff88]"
                                  }`}
                                >
                                  {t.replace(/[^a-zA-Z]/g, "").trim() || t}
                                </span>
                              ))}
                            </div>
                          </div>
                          <span className="text-[9px] text-[#8b949e] font-mono shrink-0">{item.timeText.replace(" ago", "a")}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Reset Statistics */}
                <button 
                  onClick={handleResetStats}
                  className="w-full bg-transparent hover:bg-white/5 border border-[#21262d] hover:border-[#8b949e]/30 text-[#8b949e] hover:text-[#f0f6fc] font-bold py-2 rounded-lg text-[11px] transition-all"
                >
                  Reset Statistics
                </button>

                {/* Footer text */}
                <div className="text-[9px] text-[#8b949e] text-center font-medium mt-1">
                  {gatewayOnline ? "Local firewall active on port 5000" : "Backend offline — local masking active"}
                </div>

              </div>

            </div>
          </div>

          {/* ────────────────────────────────────────────────────────
              COLUMN 3: CONTROLS PANEL (4 Columns)
              ──────────────────────────────────────────────────────── */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="text-sm font-bold text-[#8b949e] uppercase tracking-wider flex items-center gap-2">
              📊 Playground Controls
            </div>

            {/* Simulation Deck */}
            <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-6 shadow-sm">
              <h3 className="font-extrabold text-[16px] text-white flex items-center gap-2">
                🎮 Simulation Center
              </h3>
              <p className="text-xs text-[#8b949e] mt-1 font-medium leading-relaxed">
                Click buttons below to trigger leaks on different AI platforms. This dynamically increments the totals and updates the recent activity feeds.
              </p>

              {/* Event Generators */}
              <div className="space-y-3 mt-6">
                <button 
                  onClick={() => handleSimulateLeak("ChatGPT")}
                  className="w-full bg-[#10a37f]/10 border border-[#10a37f]/30 hover:border-[#10a37f]/60 text-[#10a37f] font-bold py-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-2.5"
                >
                  🔴 Trigger ChatGPT Leak
                </button>
                <button 
                  onClick={() => handleSimulateLeak("Gemini")}
                  className="w-full bg-[#38bdf8]/10 border border-[#38bdf8]/30 hover:border-[#38bdf8]/60 text-[#38bdf8] font-bold py-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-2.5"
                >
                  🟡 Trigger Gemini Leak
                </button>
                <button 
                  onClick={() => handleSimulateLeak("Claude")}
                  className="w-full bg-[#d97706]/10 border border-[#d97706]/30 hover:border-[#d97706]/60 text-[#d97706] font-bold py-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-2.5"
                >
                  🟢 Trigger Claude Leak
                </button>
              </div>
            </div>

            {/* Gateway & Reset Controls */}
            <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-6 shadow-sm">
              <h3 className="font-extrabold text-[15px] text-white">
                🛠 Global Configurations
              </h3>
              
              <div className="space-y-4.5 mt-5">
                {/* Gateway Switch */}
                <div className="flex justify-between items-center text-xs font-semibold">
                  <div>
                    <div className="text-white">Gateway Connectivity</div>
                    <div className="text-[10px] text-[#8b949e] font-medium mt-0.5">Toggle local proxy offline status</div>
                  </div>
                  
                  <button 
                    onClick={handleToggleGateway}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold border transition-all ${
                      gatewayOnline 
                        ? "bg-[#00ff88]/10 border-[#00ff88]/40 text-[#00ff88]" 
                        : "bg-[#ff4444]/10 border-[#ff4444]/40 text-[#ff4444]"
                    }`}
                  >
                    {gatewayOnline ? "ONLINE" : "OFFLINE"}
                  </button>
                </div>

                {/* Reset statistics */}
                <div className="flex justify-between items-center text-xs font-semibold border-t border-[#21262d] pt-4.5">
                  <div>
                    <div className="text-white">Reset Databases</div>
                    <div className="text-[10px] text-[#8b949e] font-medium mt-0.5">Flush audit logs and set counts to zero</div>
                  </div>

                  <button 
                    onClick={handleResetStats}
                    className="bg-[#ff4444]/15 border border-[#ff4444]/35 hover:border-[#ff4444]/65 text-[#ff4444] font-bold py-1.5 px-3 rounded-lg text-[10px] transition-colors flex items-center gap-1.5"
                  >
                    <TrashIcon className="w-3.5 h-3.5" /> Reset
                  </button>
                </div>

                {/* Reset statistics */}
                <div className="flex justify-between items-center text-xs font-semibold border-t border-[#21262d] pt-4.5">
                  <div>
                    <div className="text-white">Active Screen Navigator</div>
                    <div className="text-[10px] text-[#8b949e] font-medium mt-0.5">Force mobile frame display</div>
                  </div>

                  <div className="grid grid-cols-2 gap-1 w-32 shrink-0">
                    <button onClick={() => setActiveScreen("home")} className={`py-1 rounded text-[9px] font-extrabold border text-center uppercase ${activeScreen === "home" ? "bg-blue-600 border-blue-500 text-white" : "border-[#21262d] text-[#8b949e]"}`}>Home</button>
                    <button onClick={() => setActiveScreen("activity")} className={`py-1 rounded text-[9px] font-extrabold border text-center uppercase ${activeScreen === "activity" ? "bg-blue-600 border-blue-500 text-white" : "border-[#21262d] text-[#8b949e]"}`}>Logs</button>
                    <button onClick={() => setActiveScreen("analytics")} className={`py-1 rounded text-[9px] font-extrabold border text-center uppercase ${activeScreen === "analytics" ? "bg-blue-600 border-blue-500 text-white" : "border-[#21262d] text-[#8b949e]"}`}>Stats</button>
                    <button onClick={() => {
                      if (!selectedLog) setSelectedLog(logs[0]);
                      setActiveScreen("details");
                    }} className={`py-1 rounded text-[9px] font-extrabold border text-center uppercase ${activeScreen === "details" ? "bg-blue-600 border-blue-500 text-white" : "border-[#21262d] text-[#8b949e]"}`}>Info</button>
                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
