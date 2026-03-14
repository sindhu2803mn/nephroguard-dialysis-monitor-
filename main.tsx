import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, 
  Heart, 
  Droplets, 
  Thermometer, 
  AlertTriangle, 
  User, 
  Bell, 
  Settings, 
  LayoutDashboard, 
  History, 
  ShieldCheck,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Stethoscope,
  Wifi,
  WifiOff,
  RefreshCw
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { getAllVitals, updatePinValue } from './services/blynkService';

// --- Types ---
interface Vitals {
  heartRate: number;
  spo2: number;
  bpSystolic: number;
  bpDiastolic: number;
  temperature: number;
  flowRate: number;
  timestamp: number;
}

interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: Date;
  source: string;
}

// --- Mock Data Generators ---
const generateVitals = (prev: Vitals): Vitals => ({
  heartRate: Math.max(60, Math.min(100, prev.heartRate + (Math.random() - 0.5) * 2)),
  spo2: Math.max(94, Math.min(100, prev.spo2 + (Math.random() - 0.5) * 0.5)),
  bpSystolic: Math.max(110, Math.min(140, prev.bpSystolic + (Math.random() - 0.5) * 2)),
  bpDiastolic: Math.max(70, Math.min(90, prev.bpDiastolic + (Math.random() - 0.5) * 1)),
  temperature: Math.max(36.5, Math.min(37.5, prev.temperature + (Math.random() - 0.5) * 0.1)),
  flowRate: Math.max(190, Math.min(210, prev.flowRate + (Math.random() - 0.5) * 5)),
  timestamp: Date.now(),
});

const initialVitals: Vitals = {
  heartRate: 72,
  spo2: 98,
  bpSystolic: 120,
  bpDiastolic: 80,
  temperature: 36.8,
  flowRate: 200,
  timestamp: Date.now(),
};

// --- Components ---

const VitalCard = ({ title, value, unit, icon: Icon, color, trend }: any) => (
  <motion.div 
    whileHover={{ y: -4 }}
    className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between"
  >
    <div className="flex justify-between items-start">
      <div className={`p-2 rounded-xl ${color} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
      <span className={`text-xs font-medium px-2 py-1 rounded-full ${trend > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
        {trend > 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
      </span>
    </div>
    <div className="mt-4">
      <p className="text-slate-500 text-sm font-medium">{title}</p>
      <div className="flex items-baseline gap-1">
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        <span className="text-slate-400 text-sm">{unit}</span>
      </div>
    </div>
  </motion.div>
);

const ECGWaveform = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';

      const width = canvas.width;
      const height = canvas.height;
      const midY = height / 2;

      for (let x = 0; x < width; x++) {
        const t = (x + offset) * 0.05;
        // Simulate ECG P-QRS-T complex
        let y = 0;
        const cycle = t % (Math.PI * 2);
        
        if (cycle < 0.2) y = Math.sin(cycle * 15) * 5; // P wave
        else if (cycle > 0.4 && cycle < 0.5) y = -Math.sin((cycle - 0.4) * 30) * 10; // Q
        else if (cycle >= 0.5 && cycle < 0.6) y = Math.sin((cycle - 0.5) * 30) * 40; // R
        else if (cycle >= 0.6 && cycle < 0.7) y = -Math.sin((cycle - 0.6) * 30) * 15; // S
        else if (cycle > 1.0 && cycle < 1.4) y = Math.sin((cycle - 1.0) * 8) * 8; // T wave

        ctx.lineTo(x, midY - y);
      }
      ctx.stroke();
      setOffset(prev => prev + 2);
      animationFrameId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationFrameId);
  }, [offset]);

  return (
    <div className="bg-slate-900 rounded-2xl p-4 h-48 relative overflow-hidden">
      <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
        <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
        <span className="text-emerald-400 text-xs font-mono uppercase tracking-widest">Live ECG Feed</span>
      </div>
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={200} 
        className="w-full h-full opacity-80"
      />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(15,23,42,0.4)_100%)]" />
    </div>
  );
};

export default function App() {
  const [vitals, setVitals] = useState<Vitals>(initialVitals);
  const [history, setHistory] = useState<Vitals[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDoctorView, setIsDoctorView] = useState(false);
  const [blynkConnected, setBlynkConnected] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const blynkToken = process.env.VITE_BLYNK_AUTH_TOKEN;

  // Real-time data fetching (Blynk or Simulation)
  useEffect(() => {
    const interval = setInterval(async () => {
      setIsPolling(true);
      
      if (blynkToken) {
        try {
          const data = await getAllVitals();
          if (data.heartRate !== undefined) {
            setBlynkConnected(true);
            const [sys, dia] = (data.bp || '120/80').split('/').map(Number);
            const next: Vitals = {
              heartRate: data.heartRate || 0,
              spo2: data.spo2 || 0,
              bpSystolic: sys || 120,
              bpDiastolic: dia || 80,
              temperature: data.temp || 36.8,
              flowRate: data.flow || 200,
              timestamp: Date.now()
            };
            setVitals(next);
            setHistory(h => [...h.slice(-20), next]);
            
            // Anomaly Detection for Blynk Data
            if (next.flowRate < 195 || next.flowRate > 205) {
              triggerAlert(`Flow anomaly detected via Blynk: ${next.flowRate.toFixed(1)} mL/min`);
            }
          } else {
            setBlynkConnected(false);
            runSimulation();
          }
        } catch (error) {
          setBlynkConnected(false);
          runSimulation();
        }
      } else {
        runSimulation();
      }
      
      setTimeout(() => setIsPolling(false), 500);
    }, 3000);

    const runSimulation = () => {
      setVitals(prev => {
        const next = generateVitals(prev);
        setHistory(h => [...h.slice(-20), next]);
        if (next.flowRate < 195 || next.flowRate > 205) {
          if (Math.random() > 0.8) {
            triggerAlert(`Flow rate instability detected: ${next.flowRate.toFixed(1)} mL/min`);
          }
        }
        return next;
      });
    };

    const triggerAlert = (message: string) => {
      const newAlert: Alert = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'critical',
        message,
        timestamp: new Date(),
        source: blynkToken ? 'Blynk IoT Cloud' : 'Simulation Engine'
      };
      setAlerts(a => [newAlert, ...a.slice(0, 4)]);
      
      // If Blynk is connected, we could trigger a hardware buzzer via V10
      if (blynkToken) {
        updatePinValue('V10', '1'); // Trigger buzzer
      }
    };

    return () => clearInterval(interval);
  }, [blynkToken]);

  const chartData = useMemo(() => history.map(v => ({
    time: new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    hr: Math.round(v.heartRate),
    flow: Math.round(v.flowRate),
    spo2: Math.round(v.spo2)
  })), [history]);

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
            <ShieldCheck className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">NephroGuard</h1>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'sessions', icon: History, label: 'Sessions' },
            { id: 'alerts', icon: Bell, label: 'Alerts', badge: alerts.length },
            { id: 'settings', icon: Settings, label: 'Settings' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                activeTab === item.id 
                  ? 'bg-emerald-50 text-emerald-700 font-semibold' 
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto">
          {/* Blynk Status Card */}
          <div className={`mb-4 p-4 rounded-2xl border flex flex-col gap-2 ${blynkConnected ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-100 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Blynk IoT</span>
              {isPolling && <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin" />}
            </div>
            <div className="flex items-center gap-2">
              {blynkConnected ? <Wifi className="w-4 h-4 text-emerald-600" /> : <WifiOff className="w-4 h-4 text-slate-400" />}
              <span className={`text-xs font-bold ${blynkConnected ? 'text-emerald-700' : 'text-slate-500'}`}>
                {blynkConnected ? 'Connected' : 'Offline / Sim'}
              </span>
            </div>
            {!blynkToken && (
              <p className="text-[10px] text-slate-400 leading-tight">Add VITE_BLYNK_AUTH_TOKEN to .env to connect hardware.</p>
            )}
          </div>

          <div className="bg-slate-900 rounded-2xl p-4 text-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Patient ID</p>
                <p className="text-sm font-bold">#PX-9921</p>
              </div>
            </div>
            <button 
              onClick={() => setIsDoctorView(!isDoctorView)}
              className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Stethoscope className="w-3 h-3" />
              {isDoctorView ? 'Switch to Patient' : 'Medical Portal'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white border-bottom border-slate-200 px-8 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {isDoctorView ? 'Remote Patient Monitoring' : 'Treatment Dashboard'}
            </h2>
            <p className="text-slate-500 text-sm">
              {isDoctorView ? 'Monitoring: John Doe (Home Dialysis)' : 'Dialysis Session Active • 01:45:22'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100">
              <Zap className="w-3 h-3 fill-emerald-700" />
              AWS CLOUD SYNCED
            </div>
            <button className="p-2 text-slate-400 hover:text-slate-600 relative">
              <Bell className="w-6 h-6" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
            </button>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* Vitals Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <VitalCard 
              title="Heart Rate" 
              value={Math.round(vitals.heartRate)} 
              unit="BPM" 
              icon={Heart} 
              color="bg-rose-500" 
              trend={0.5} 
            />
            <VitalCard 
              title="Oxygen (SpO2)" 
              value={vitals.spo2.toFixed(1)} 
              unit="%" 
              icon={Activity} 
              color="bg-blue-500" 
              trend={-0.2} 
            />
            <VitalCard 
              title="Blood Pressure" 
              value={`${Math.round(vitals.bpSystolic)}/${Math.round(vitals.bpDiastolic)}`} 
              unit="mmHg" 
              icon={Activity} 
              color="bg-indigo-500" 
              trend={1.2} 
            />
            <VitalCard 
              title="Body Temp" 
              value={vitals.temperature.toFixed(1)} 
              unit="°C" 
              icon={Thermometer} 
              color="bg-orange-500" 
              trend={0.1} 
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Waveform & Flow */}
            <div className="lg:col-span-2 space-y-8">
              {/* ECG Section */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-600" />
                    ECG Visualization
                  </h3>
                  <div className="flex gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Lead II</span>
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">Normal Sinus Rhythm</span>
                  </div>
                </div>
                <ECGWaveform />
              </div>

              {/* Flow Rate Monitoring */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Droplets className="w-5 h-5 text-blue-600" />
                      Dialysis Flow Safety
                    </h3>
                    <p className="text-slate-400 text-xs">YF-S201 Sensor Real-time Analysis</p>
                  </div>
                  <div className={`px-4 py-2 rounded-2xl flex items-center gap-2 ${vitals.flowRate > 195 && vitals.flowRate < 205 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700 animate-pulse'}`}>
                    {vitals.flowRate > 195 && vitals.flowRate < 205 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    <span className="text-sm font-bold">{vitals.flowRate > 195 && vitals.flowRate < 205 ? 'SAFE FLOW' : 'FLOW ANOMALY'}</span>
                  </div>
                </div>
                
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="time" hide />
                      <YAxis domain={[180, 220]} hide />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="flow" 
                        stroke="#3b82f6" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorFlow)" 
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex justify-between items-center text-xs text-slate-400 font-medium">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /> Current: {vitals.flowRate.toFixed(1)} mL/min</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-300" /> Target: 200.0 mL/min</span>
                  </div>
                  <span>Threshold: ±2.5%</span>
                </div>
              </div>
            </div>

            {/* Right Column: Alerts & Status */}
            <div className="space-y-8">
              {/* Machine Status */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold mb-6">Machine Status</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Power Supply', status: 'Stable', icon: Zap, color: 'text-emerald-500' },
                    { label: 'Pump Activity', status: 'Active', icon: Activity, color: 'text-blue-500' },
                    { label: 'Fluid Temp', status: '37.2°C', icon: Thermometer, color: 'text-orange-500' },
                    { label: 'Connectivity', status: 'AWS IoT Core', icon: ShieldCheck, color: 'text-emerald-500' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50">
                      <div className="flex items-center gap-3">
                        <item.icon className={`w-5 h-5 ${item.color}`} />
                        <span className="text-sm font-medium text-slate-700">{item.label}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-900">{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Alerts */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col h-[500px]">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold">Recent Alerts</h3>
                  <button className="text-xs text-emerald-600 font-bold hover:underline">Clear All</button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                  <AnimatePresence initial={false}>
                    {alerts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                        <CheckCircle2 className="w-12 h-12 opacity-20" />
                        <p className="text-sm">All systems normal</p>
                      </div>
                    ) : (
                      alerts.map((alert) => (
                        <motion.div
                          key={alert.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className={`p-4 rounded-2xl border ${
                            alert.type === 'critical' 
                              ? 'bg-rose-50 border-rose-100' 
                              : 'bg-amber-50 border-amber-100'
                          }`}
                        >
                          <div className="flex gap-3">
                            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                              alert.type === 'critical' ? 'bg-rose-500' : 'bg-amber-500'
                            }`}>
                              <AlertTriangle className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1">
                              <p className={`text-sm font-bold ${
                                alert.type === 'critical' ? 'text-rose-900' : 'text-amber-900'
                              }`}>
                                {alert.message}
                              </p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[10px] font-medium text-slate-500 uppercase">
                                  {alert.source}
                                </span>
                                <span className="text-[10px] font-medium text-slate-500">
                                  {alert.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>
                <button className="mt-6 w-full py-3 bg-slate-900 text-white rounded-2xl text-sm font-bold hover:bg-slate-800 transition-colors">
                  View Alert History
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}} />
    </div>
  );
}
