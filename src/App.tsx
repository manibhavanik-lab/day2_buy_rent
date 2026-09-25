import React, { useState, useEffect } from 'react';
import {
  Search,
  MapPin,
  Train,
  GraduationCap,
  Building2,
  TrendingUp,
  Server,
  Terminal,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Compass,
  DollarSign,
  Sparkles,
  Layers,
  ChevronRight,
  Info,
  Bot,
  Wrench,
  WifiOff
} from 'lucide-react';

interface AskToolCall {
  name: string;
  args: Record<string, any>;
  failed?: boolean;
}

interface UnavailableServer {
  address: string;
  reason: string;
}

interface AskResponse {
  answer: string;
  tool_calls: AskToolCall[];
  unavailable: UnavailableServer[];
  model: string;
  answered_at: string;
}

interface MrtStation {
  name: string;
  lines: string[];
  distance_meters: number;
  distance_km: number;
}

interface School {
  name: string;
  town?: string;
  distance_meters: number;
  distance_km: number;
  within_1km: boolean;
  within_2km: boolean;
}

interface LocationData {
  postal_code: string;
  address: string;
  block: string;
  road_name: string;
  building: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  nearest_mrt: MrtStation[];
  nearest_primary_schools: School[];
  source: string;
  fetched_at: string;
}

interface HdbComparable {
  month: string;
  town: string;
  flat_type: string;
  block: string;
  street_name: string;
  storey_range: string;
  floor_area_sqm: number;
  flat_model: string;
  lease_commence_date: string;
  remaining_lease: string;
  resale_price: number;
}

interface HdbData {
  town: string;
  flat_type: string;
  months_requested: number;
  total_found: number;
  comparables: HdbComparable[];
  source: string;
  fetched_at: string;
}

interface PropertySnapshotData {
  postal_code: string;
  address: string;
  town: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  nearest_mrt: MrtStation[];
  nearest_primary_schools: School[];
  market_summary: {
    town: string;
    flat_type_benchmark: string;
    sample_size: number;
    median_resale_price: number;
    avg_resale_price: number;
    avg_price_per_sqm: number;
    min_price: number;
    max_price: number;
    recent_transactions: HdbComparable[];
  };
  source: string;
  fetched_at: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'ask' | 'app' | 'mcp'>('ask');
  const [postalInput, setPostalInput] = useState('560560');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask Agent State
  const [askQuestion, setAskQuestion] = useState('What is the address and coordinates for postal code 560560?');
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [askResult, setAskResult] = useState<AskResponse | null>(null);
  const [copiedAnswer, setCopiedAnswer] = useState(false);

  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [hdbData, setHdbData] = useState<HdbData | null>(null);
  const [snapshotData, setSnapshotData] = useState<PropertySnapshotData | null>(null);

  // MCP Tester state
  const [mcpSelectedTool, setMcpSelectedTool] = useState<string>('renter_lookup_postal_code');
  const [mcpPostalArg, setMcpPostalArg] = useState('560560');
  const [mcpTownArg, setMcpTownArg] = useState('ANG MO KIO');
  const [mcpFlatTypeArg, setMcpFlatTypeArg] = useState('4 ROOM');
  const [mcpMonthsArg, setMcpMonthsArg] = useState(6);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpResponse, setMcpResponse] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const handleAsk = async (questionToAsk?: string) => {
    const q = (questionToAsk !== undefined ? questionToAsk : askQuestion).trim();
    if (!q) {
      setAskError('Please enter a question to ask the agent.');
      return;
    }
    if (q.length > 500) {
      setAskError('Question cannot exceed 500 characters.');
      return;
    }

    setAskLoading(true);
    setAskError(null);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: q }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || (data.reason ? `${data.error}: ${data.reason}` : 'Failed to query the agent.');
        setAskError(errMsg);
      } else {
        setAskResult(data);
      }
    } catch (err: any) {
      setAskError(err.message || 'Failed to connect to /api/ask endpoint.');
    } finally {
      setAskLoading(false);
    }
  };

  // Quick preset postal codes in Singapore
  const presets = [
    { label: 'Ang Mo Kio (Central)', postal: '560560' },
    { label: 'Tampines (East)', postal: '520201' },
    { label: 'Bedok Reservoir', postal: '460001' },
    { label: 'Jurong West (West)', postal: '640500' },
    { label: 'Woodlands (North)', postal: '730500' },
    { label: 'Raffles Place (CBD)', postal: '048581' }
  ];

  const handleSearch = async (postalToQuery?: string) => {
    const postal = (postalToQuery || postalInput).trim();
    if (!/^\d{6}$/.test(postal)) {
      setError('Please enter a valid 6-digit Singapore postal code (e.g., 560560).');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch location via /api/onemap
      const locRes = await fetch(`/api/onemap?postal_code=${postal}`);
      if (!locRes.ok) {
        const errJson = await locRes.json().catch(() => ({}));
        throw new Error(errJson.error || `OneMap search failed with status ${locRes.status}`);
      }
      const loc: LocationData = await locRes.json();
      setLocationData(loc);

      // 2. Fetch snapshot via /api/insights
      const snapRes = await fetch(`/api/insights?postal_code=${postal}`);
      if (snapRes.ok) {
        const snap: PropertySnapshotData = await snapRes.json();
        setSnapshotData(snap);

        // 3. Fetch HDB comparables for the resolved town
        const hdbRes = await fetch(`/api/hdb?town=${encodeURIComponent(snap.town)}&flat_type=4%20ROOM&months=6`);
        if (hdbRes.ok) {
          const hdb: HdbData = await hdbRes.json();
          setHdbData(hdb);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve location intelligence.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleSearch('560560');
  }, []);

  const testMcpTool = async () => {
    setMcpLoading(true);
    setMcpResponse(null);

    let params: any = {};
    if (mcpSelectedTool === 'renter_lookup_postal_code') {
      params = { postal_code: mcpPostalArg };
    } else if (mcpSelectedTool === 'renter_hdb_comparables') {
      params = { town: mcpTownArg, flat_type: mcpFlatTypeArg, months: Number(mcpMonthsArg) };
    } else if (mcpSelectedTool === 'renter_property_snapshot') {
      params = { postal_code: mcpPostalArg };
    }

    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: mcpSelectedTool,
        arguments: params
      }
    };

    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setMcpResponse(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setMcpResponse(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setMcpLoading(false);
    }
  };

  const curlExample = `curl -X POST https://day2buyrent.vercel.app/api/mcp \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "renter_lookup_postal_code",
      "arguments": { "postal_code": "560560" }
    }
  }'`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white font-bold">
              SG
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-lg text-slate-100">Singapore Renter</span>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400">
                  MCP Active
                </span>
              </div>
              <p className="text-xs text-slate-400">Live OneMap & Data.gov.sg Property Intelligence</p>
            </div>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('ask')}
              className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition flex items-center space-x-1.5 ${
                activeTab === 'ask'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
              <span>Ask Agent (/api/ask)</span>
            </button>
            <button
              onClick={() => setActiveTab('app')}
              className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                activeTab === 'app'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Property Explorer
            </button>
            <button
              onClick={() => setActiveTab('mcp')}
              className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition flex items-center space-x-1.5 ${
                activeTab === 'mcp'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>MCP Protocol (/api/mcp)</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'ask' ? (
          <div className="space-y-8">
            {/* Ask Banner */}
            <div className="bg-gradient-to-b from-slate-900 to-slate-900/70 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-500/30 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-4">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Gemini 3.8 Flash &bull; Multi-MCP Intelligence Agent</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
                  Ask the Singapore Rental Agent
                </h1>
                <p className="text-sm sm:text-base text-slate-400 mb-6">
                  The agent answers your question by letting Gemini autonomously choose among tools published by the MCP servers in <code className="text-xs bg-slate-800 px-1.5 py-0.5 rounded text-sky-300 font-mono">MCP_SERVERS</code>.
                </p>

                {/* Question Text Box */}
                <div className="space-y-3">
                  <div className="relative">
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={askQuestion}
                      onChange={(e) => setAskQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAsk();
                        }
                      }}
                      placeholder="Ask anything about Singapore rentals, postal codes, or HDB comparables (e.g., What is the address, coordinates, and nearby MRT for postal code 560560?)"
                      className="w-full bg-slate-950/90 border border-slate-700 rounded-xl p-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm sm:text-base resize-none shadow-inner"
                    />
                    <div className="absolute right-3 bottom-3 text-xs text-slate-500 font-mono">
                      {askQuestion.length}/500
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    {/* Quick Prompts */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">Suggestions:</span>
                      {[
                        { label: 'Postal 560560 info', text: 'What is the address and coordinates for postal code 560560?' },
                        { label: 'Ang Mo Kio 4-Room Rents', text: 'What are the recent 4-room HDB rental comparables in Ang Mo Kio?' },
                        { label: 'Tampines 520201 Snapshot', text: 'Give me a property snapshot and nearest MRT for postal code 520201.' }
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setAskQuestion(item.text);
                            handleAsk(item.text);
                          }}
                          className="text-xs px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition border border-slate-700/60"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {/* Submit Button */}
                    <button
                      onClick={() => handleAsk()}
                      disabled={askLoading || !askQuestion.trim()}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-medium transition flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/25 shrink-0 w-full sm:w-auto"
                    >
                      {askLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Consulting Agent...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Ask Agent</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {askError && (
                  <div className="mt-4 p-4 rounded-xl bg-red-950/50 border border-red-800/80 text-red-300 text-xs sm:text-sm flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
                    <div>
                      <div className="font-semibold">Query Failed</div>
                      <div className="text-red-200 mt-0.5">{askError}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Answer & Inspection Results */}
            {askResult && (
              <div className="space-y-6">
                {/* The Answer */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-800 gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-950 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                        <Bot className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-base">Agent Response</h3>
                        <div className="flex items-center space-x-2 text-xs text-slate-400">
                          <span className="font-mono text-indigo-400">{askResult.model}</span>
                          <span>&bull;</span>
                          <span>Answered at {new Date(askResult.answered_at).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(askResult.answer);
                        setCopiedAnswer(true);
                        setTimeout(() => setCopiedAnswer(false), 2000);
                      }}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition border border-slate-700/60 self-start sm:self-auto"
                    >
                      {copiedAnswer ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedAnswer ? 'Copied' : 'Copy Answer'}</span>
                    </button>
                  </div>

                  <div className="text-slate-100 text-sm sm:text-base leading-relaxed whitespace-pre-line bg-slate-950/60 p-4 sm:p-5 rounded-xl border border-slate-800/80 font-normal">
                    {askResult.answer}
                  </div>
                </div>

                {/* Every Tool Called Under The Answer */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <Wrench className="w-5 h-5 text-sky-400" />
                      <h3 className="font-semibold text-white text-base">Tools Called by Agent</h3>
                      <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-sky-950 border border-sky-500/40 text-sky-400">
                        {askResult.tool_calls.length} {askResult.tool_calls.length === 1 ? 'call' : 'calls'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">Chronological execution</span>
                  </div>

                  {askResult.tool_calls.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 text-slate-400 text-sm italic">
                      No tools were invoked for this query.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {askResult.tool_calls.map((call, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-950 border border-slate-800/90 rounded-xl p-4 transition hover:border-slate-700"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 text-xs flex items-center justify-center font-mono font-bold">
                                {idx + 1}
                              </span>
                              <span className="font-mono text-sm font-semibold text-sky-300">
                                {call.name}
                              </span>
                            </div>

                            {call.failed ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-red-950 border border-red-500/40 text-red-400 text-xs font-medium">
                                <AlertCircle className="w-3 h-3" />
                                <span>Failed</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 text-xs font-medium">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Success</span>
                              </span>
                            )}
                          </div>

                          <div className="mt-2">
                            <div className="text-xs text-slate-400 mb-1 font-medium">Arguments:</div>
                            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-sky-200 font-mono overflow-x-auto">
                              {JSON.stringify(call.args, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Unavailable Servers (in grey) */}
                {askResult.unavailable && askResult.unavailable.length > 0 && (
                  <div className="bg-slate-900/60 border border-slate-800/90 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center space-x-2 mb-3">
                      <WifiOff className="w-4 h-4 text-slate-400" />
                      <h3 className="font-medium text-slate-300 text-sm">Unavailable MCP Servers</h3>
                      <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-slate-800 text-slate-400 border border-slate-700">
                        {askResult.unavailable.length}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">
                      The agent noted the following endpoints were unreachable and safely proceeded without them:
                    </p>

                    <div className="space-y-2">
                      {askResult.unavailable.map((unav, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" />
                            <span className="font-mono text-slate-300 font-medium break-all">{unav.address}</span>
                          </div>
                          <span className="text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800 shrink-0">
                            {unav.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : activeTab === 'app' ? (
          <div className="space-y-8">
            {/* Search Banner */}
            <div className="bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
              <div className="max-w-2xl">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
                  Rental & Property Intelligence Engine
                </h1>
                <p className="text-sm sm:text-base text-slate-400 mb-6">
                  Validate Singapore locations via OneMap, analyze transit accessibility and school proximity, and explore recent HDB resale comparables.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      maxLength={6}
                      value={postalInput}
                      onChange={(e) => setPostalInput(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Enter 6-digit postal code (e.g. 560560)"
                      className="w-full bg-slate-950/80 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm sm:text-base"
                    />
                  </div>
                  <button
                    onClick={() => handleSearch()}
                    disabled={loading}
                    className="px-6 py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl font-medium transition flex items-center justify-center space-x-2 shadow-lg shadow-sky-600/20"
                  >
                    {loading ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <span>Inspect Location</span>
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Quick Try:</span>
                  {presets.map((p) => (
                    <button
                      key={p.postal}
                      onClick={() => {
                        setPostalInput(p.postal);
                        handleSearch(p.postal);
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition border border-slate-700/60"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="mt-4 p-3 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-xs sm:text-sm flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Results Grid */}
            {locationData && (
              <div className="space-y-6">
                {/* Location Overview Card */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center space-x-2 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-2">
                        <MapPin className="w-4 h-4" />
                        <span>Verified Location</span>
                      </div>
                      <h2 className="text-lg font-bold text-white mb-1">{locationData.address}</h2>
                      <p className="text-xs text-slate-400">Postal Code: {locationData.postal_code}</p>
                      {locationData.building && (
                        <p className="text-xs text-slate-400">Building: {locationData.building}</p>
                      )}
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                      <span>Lat: {locationData.coordinates.latitude.toFixed(5)}</span>
                      <span>Lng: {locationData.coordinates.longitude.toFixed(5)}</span>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
                        <Train className="w-4 h-4" />
                        <span>Nearest MRT Stations</span>
                      </div>
                      {locationData.nearest_mrt.slice(0, 3).map((st, i) => (
                        <div key={i} className="mb-2 last:mb-0">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-slate-200">{st.name}</span>
                            <span className="text-xs font-semibold text-emerald-400">
                              {st.distance_meters < 1000
                                ? `${st.distance_meters}m`
                                : `${st.distance_km}km`}
                            </span>
                          </div>
                          <div className="flex gap-1 mt-0.5">
                            {st.lines.map((l) => (
                              <span
                                key={l}
                                className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono"
                              >
                                {l}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-500">
                      Calculated via Haversine transit distance
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
                        <GraduationCap className="w-4 h-4" />
                        <span>Primary School Proximity</span>
                      </div>
                      {locationData.nearest_primary_schools.slice(0, 3).map((sc, i) => (
                        <div key={i} className="mb-2 last:mb-0">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-slate-200 truncate pr-2">{sc.name}</span>
                            <span
                              className={`text-xs font-semibold ${
                                sc.within_1km
                                  ? 'text-emerald-400'
                                  : sc.within_2km
                                  ? 'text-amber-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {sc.distance_meters < 1000
                                ? `${sc.distance_meters}m`
                                : `${sc.distance_km}km`}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {sc.within_1km ? 'Within 1km balloting priority' : 'Within 2km priority'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-500">
                      MOE Primary 1 Registration standard
                    </div>
                  </div>
                </div>

                {/* Market Snapshot & Comparables */}
                {snapshotData && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
                      <div>
                        <div className="flex items-center space-x-2 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1">
                          <TrendingUp className="w-4 h-4" />
                          <span>HDB Market Benchmark (Town: {snapshotData.town})</span>
                        </div>
                        <h2 className="text-xl font-bold text-white">
                          Recent Verified Resale Transactions
                        </h2>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-right">
                          <div className="text-xs text-slate-400">Median Resale Price</div>
                          <div className="text-lg font-bold text-sky-400">
                            ${snapshotData.market_summary.median_resale_price.toLocaleString()}
                          </div>
                        </div>
                        <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-right">
                          <div className="text-xs text-slate-400">Avg Price / Sqm</div>
                          <div className="text-lg font-bold text-indigo-400">
                            ${snapshotData.market_summary.avg_price_per_sqm.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Table of Transactions */}
                    <div className="mt-6 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-medium">
                          <tr>
                            <th className="py-3 px-4 rounded-l-lg">Month</th>
                            <th className="py-3 px-4">Block / Street</th>
                            <th className="py-3 px-4">Flat Type</th>
                            <th className="py-3 px-4">Floor Area</th>
                            <th className="py-3 px-4">Storey</th>
                            <th className="py-3 px-4">Remaining Lease</th>
                            <th className="py-3 px-4 text-right rounded-r-lg">Price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300">
                          {snapshotData.market_summary.recent_transactions.map((t, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40 transition">
                              <td className="py-3 px-4 font-mono text-xs">{t.month}</td>
                              <td className="py-3 px-4 font-medium text-white">
                                {t.block} {t.street_name}
                              </td>
                              <td className="py-3 px-4">{t.flat_type}</td>
                              <td className="py-3 px-4">{t.floor_area_sqm} sqm</td>
                              <td className="py-3 px-4 text-xs text-slate-400">{t.storey_range}</td>
                              <td className="py-3 px-4 text-xs text-slate-400">{t.remaining_lease}</td>
                              <td className="py-3 px-4 text-right font-semibold text-emerald-400">
                                ${t.resale_price.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* MCP Protocol Tab */
          <div className="space-y-8">
            <div className="bg-gradient-to-b from-indigo-950/40 to-slate-900 border border-indigo-900/40 rounded-2xl p-6 sm:p-8">
              <div className="flex items-center space-x-3 text-indigo-400 mb-2">
                <Server className="w-6 h-6" />
                <span className="text-sm font-semibold tracking-wider uppercase">
                  Model Context Protocol Server
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                External Agent Discovery & Tool Calling
              </h1>
              <p className="text-slate-300 text-sm sm:text-base max-w-3xl mb-6">
                This app runs a live Streamable HTTP MCP server on <code className="text-indigo-300 font-mono bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800">/api/mcp</code>.
                Agents built with Gemini’s SDK or any MCP-compatible framework can query location intelligence, verified HDB resale comparables, and neighborhood snapshots.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-indigo-900/30 text-xs">
                <div>
                  <span className="text-slate-400 block">Server Name</span>
                  <span className="text-slate-200 font-mono font-medium">renter-server (v1.0.0)</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Protocol Transport</span>
                  <span className="text-slate-200 font-mono font-medium">Streamable HTTP (2025-11-25)</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Guarantees</span>
                  <span className="text-slate-200 font-medium">Read-Only, Zero Synthetic Data, Sessionless</span>
                </div>
              </div>
            </div>

            {/* Tool Registry Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center space-x-2 text-sky-400 font-semibold mb-2">
                  <MapPin className="w-4 h-4" />
                  <code className="text-xs bg-slate-950 px-2 py-1 rounded border border-slate-800">
                    renter_lookup_postal_code
                  </code>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  Returns verified address details, geographical coordinates, nearest MRT stations, and nearby primary schools for a Singapore postal code. Data is retrieved directly in real time from OneMap Singapore API.
                </p>
                <div className="text-[11px] text-slate-500 font-mono">
                  Input: postal_code (6-digit string)
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center space-x-2 text-indigo-400 font-semibold mb-2">
                  <TrendingUp className="w-4 h-4" />
                  <code className="text-xs bg-slate-950 px-2 py-1 rounded border border-slate-800">
                    renter_hdb_comparables
                  </code>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  Returns actual recent HDB resale transactions filtered by town and flat type, sorted newest first for the requested time window. Data is read directly from Data.gov.sg without synthetic rows.
                </p>
                <div className="text-[11px] text-slate-500 font-mono">
                  Inputs: town, flat_type, months
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center space-x-2 text-emerald-400 font-semibold mb-2">
                  <Layers className="w-4 h-4" />
                  <code className="text-xs bg-slate-950 px-2 py-1 rounded border border-slate-800">
                    renter_property_snapshot
                  </code>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  Returns a comprehensive property intelligence snapshot combining location verification, nearby amenities, and current market transaction insights for a given postal code.
                </p>
                <div className="text-[11px] text-slate-500 font-mono">
                  Input: postal_code (6-digit string)
                </div>
              </div>
            </div>

            {/* Live Interactive MCP Tester */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-lg font-bold text-white">Live Tool Invocation Tester</h2>
                </div>
                <span className="text-xs text-slate-400">Executes real JSON-RPC 2.0 against /api/mcp</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Select MCP Tool
                    </label>
                    <select
                      value={mcpSelectedTool}
                      onChange={(e) => setMcpSelectedTool(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="renter_lookup_postal_code">renter_lookup_postal_code</option>
                      <option value="renter_hdb_comparables">renter_hdb_comparables</option>
                      <option value="renter_property_snapshot">renter_property_snapshot</option>
                    </select>
                  </div>

                  {mcpSelectedTool === 'renter_lookup_postal_code' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        postal_code
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={mcpPostalArg}
                        onChange={(e) => setMcpPostalArg(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono"
                        placeholder="560560"
                      />
                    </div>
                  )}

                  {mcpSelectedTool === 'renter_hdb_comparables' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                          town
                        </label>
                        <input
                          type="text"
                          value={mcpTownArg}
                          onChange={(e) => setMcpTownArg(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono"
                          placeholder="ANG MO KIO"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                          flat_type
                        </label>
                        <select
                          value={mcpFlatTypeArg}
                          onChange={(e) => setMcpFlatTypeArg(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white"
                        >
                          <option value="2 ROOM">2 ROOM</option>
                          <option value="3 ROOM">3 ROOM</option>
                          <option value="4 ROOM">4 ROOM</option>
                          <option value="5 ROOM">5 ROOM</option>
                          <option value="EXECUTIVE">EXECUTIVE</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                          months
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={36}
                          value={mcpMonthsArg}
                          onChange={(e) => setMcpMonthsArg(parseInt(e.target.value, 10))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {mcpSelectedTool === 'renter_property_snapshot' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        postal_code
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={mcpPostalArg}
                        onChange={(e) => setMcpPostalArg(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono"
                        placeholder="560560"
                      />
                    </div>
                  )}

                  <button
                    onClick={testMcpTool}
                    disabled={mcpLoading}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-medium transition flex items-center justify-center space-x-2"
                  >
                    {mcpLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Terminal className="w-4 h-4" />
                        <span>Send MCP Request</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Response Viewer */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    JSON-RPC Response
                  </label>
                  <pre className="w-full h-72 bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-400 overflow-auto">
                    {mcpResponse || '// Click "Send MCP Request" to view live tool output...'}
                  </pre>
                </div>
              </div>
            </div>

            {/* Integration snippet */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2 text-slate-200 font-semibold">
                  <Terminal className="w-4 h-4 text-sky-400" />
                  <span>cURL Command Example</span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(curlExample);
                    setCopiedCurl(true);
                    setTimeout(() => setCopiedCurl(false), 2000);
                  }}
                  className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center space-x-1.5"
                >
                  {copiedCurl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-slate-950 border border-slate-800 p-4 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto">
                {curlExample}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/50 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <span>Powered by OneMap Singapore & Data.gov.sg</span>
            <span>•</span>
            <span>Streamable HTTP MCP @ /api/mcp</span>
          </div>
          <div>All data authenticated directly from official government APIs. No synthesized rows.</div>
        </div>
      </footer>
    </div>
  );
}
