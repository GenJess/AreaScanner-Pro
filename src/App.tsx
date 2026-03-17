import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, MapPin, Loader2, Map as MapIcon, ExternalLink, 
  Crosshair, Layers, Table as TableIcon, Download, 
  CheckSquare, Square, RefreshCw, ChevronRight, ChevronLeft,
  Info, Navigation, Menu, X, Copy, FileText, FileJson, Share2
} from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapContainer, TileLayer, Marker, Popup, 
  useMapEvents, Circle, useMap 
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { searchPlaces, SearchResponse, PlaceResult } from './services/geminiService';

// Fix for default marker icons in Leaflet
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom animated pin icon
const createAnimatedIcon = (color: string = '#10b981') => L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: ${color};" class="w-4 h-4 rounded-full border-2 border-white shadow-lg animate-bounce"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Map controller to handle panning/zooming
function MapController({ center, zoom, bounds }: { center: [number, number], zoom: number, bounds?: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else {
      map.setView(center, zoom);
    }
  }, [center, zoom, bounds, map]);
  return null;
}

// Draggable scan zone component
function ScanZone({ center, radius, onMove, active }: { center: [number, number], radius: number, onMove: (pos: [number, number]) => void, active: boolean }) {
  useMapEvents({
    click(e) {
      if (active) {
        onMove([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  return (
    <Circle
      center={center}
      radius={radius}
      pathOptions={{ 
        color: active ? '#10b981' : '#57534e', 
        fillColor: active ? '#10b981' : '#57534e', 
        fillOpacity: active ? 0.1 : 0.05,
        dashArray: active ? '5, 10' : '0',
        weight: active ? 2 : 1
      }}
    />
  );
}

export default function App() {
  // State
  const [query, setQuery] = useState('basketball courts');
  const [locationName, setLocationName] = useState('San Francisco, CA');
  const [scanCenter, setScanCenter] = useState<[number, number]>([37.7749, -122.4194]);
  const [scanRadius] = useState(8000); // 8km radius to cover a zip code/city area
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState(25);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [mapBounds, setMapBounds] = useState<L.LatLngBoundsExpression | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlaces, setSelectedPlaces] = useState<Set<number>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isEditingZone, setIsEditingZone] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  // Refs
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  // Progress simulation
  useEffect(() => {
    if (loading) {
      setProgress(0);
      setEta(25);
      progressInterval.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return prev;
          return prev + (100 / 25) * 0.5; // Simulate 25 seconds for larger area
        });
        setEta(prev => Math.max(0, prev - 0.5));
      }, 500);
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current);
      setProgress(0);
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [loading]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedPlaces(new Set());
    setDrawerOpen(false);
    setIsEditingZone(false);

    try {
      const res = await searchPlaces(query, locationName, { 
        latitude: scanCenter[0], 
        longitude: scanCenter[1] 
      });
      setResult(res);
      setSelectedPlaces(new Set(res.places.map((_, i) => i)));
      
      // Calculate bounds to fit all markers
      const validPlaces = res.places.filter(p => p.lat && p.lng);
      if (validPlaces.length > 0) {
        const bounds = L.latLngBounds(validPlaces.map(p => [p.lat!, p.lng!]));
        setMapBounds(bounds);
      } else {
        setMapBounds(undefined);
      }
      
      setDrawerOpen(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while searching.');
    } finally {
      setLoading(false);
      setProgress(100);
    }
  };

  const togglePlaceSelection = (idx: number) => {
    const newSet = new Set(selectedPlaces);
    if (newSet.has(idx)) newSet.delete(idx);
    else newSet.add(idx);
    setSelectedPlaces(newSet);
  };

  const getMarkdown = () => {
    if (!result) return "";
    const selected = result.places.filter((_, i) => selectedPlaces.has(i));
    let md = `# AreaScan Results: ${query}\n\n`;
    md += `**Location:** ${locationName}\n`;
    md += `**Summary:**\n${result.text}\n\n`;
    md += `## Locations Found\n\n`;
    selected.forEach(p => {
      md += `### ${p.title}\n`;
      md += `- **Maps Link:** [View on Google Maps](${p.uri})\n`;
      if (p.lat && p.lng) md += `- **Coordinates:** ${p.lat}, ${p.lng}\n`;
      md += `\n`;
    });
    return md;
  };

  const getHTML = () => {
    if (!result) return "";
    const selected = result.places.filter((_, i) => selectedPlaces.has(i));
    let html = `<html><head><title>AreaScan Results</title><style>body{font-family:sans-serif;padding:40px;line-height:1.6;}h1{color:#10b981;}h3{margin-top:30px;border-bottom:1px solid #eee;}</style></head><body>`;
    html += `<h1>AreaScan Results: ${query}</h1>`;
    html += `<p><strong>Location:</strong> ${locationName}</p>`;
    html += `<p><strong>Summary:</strong> ${result.text}</p>`;
    html += `<h2>Locations Found</h2>`;
    selected.forEach(p => {
      html += `<h3>${p.title}</h3>`;
      html += `<p><a href="${p.uri}">View on Google Maps</a></p>`;
      if (p.lat && p.lng) html += `<p>Coordinates: ${p.lat}, ${p.lng}</p>`;
    });
    html += `</body></html>`;
    return html;
  };

  const exportHTML = () => {
    const html = getHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-results-${Date.now()}.html`;
    a.click();
    setShowExportMenu(false);
  };

  const exportJSON = () => {
    if (!result) return;
    const data = result.places.filter((_, i) => selectedPlaces.has(i));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-results-${Date.now()}.json`;
    a.click();
    setShowExportMenu(false);
  };

  const exportMarkdown = () => {
    const md = getMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-results-${Date.now()}.md`;
    a.click();
    setShowExportMenu(false);
  };

  const copyToClipboard = async (type: 'json' | 'md') => {
    const content = type === 'json' ? JSON.stringify(result?.places.filter((_, i) => selectedPlaces.has(i)), null, 2) : getMarkdown();
    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus(`${type.toUpperCase()} Copied!`);
      setTimeout(() => setCopyStatus(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
    setShowExportMenu(false);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0a0a] text-stone-100 overflow-hidden font-sans">
      {/* Search Header Overlay */}
      <div className="absolute top-0 left-0 right-0 z-[1001] p-4 sm:p-6 pointer-events-none">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-3 pointer-events-auto">
          <div className="flex-1 flex flex-col sm:flex-row gap-2 bg-black/60 backdrop-blur-xl border border-white/10 p-2 rounded-2xl shadow-2xl">
            <div className="flex-1 relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 group-focus-within:text-emerald-400 transition-colors" />
              <input 
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for..."
                className="w-full bg-white/5 border border-transparent rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:bg-white/10 transition-all"
              />
            </div>
            <div className="flex-1 relative group">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 group-focus-within:text-emerald-400 transition-colors" />
              <input 
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Location..."
                className="w-full bg-white/5 border border-transparent rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:bg-white/10 transition-all"
              />
            </div>
            <button 
              onClick={() => handleSearch()}
              disabled={loading}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-stone-800 text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
              <span className="hidden sm:inline">{loading ? 'Scanning...' : 'Scan Area'}</span>
            </button>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={() => setIsEditingZone(!isEditingZone)}
              className={`p-3 backdrop-blur-xl border rounded-2xl transition-all shadow-2xl flex items-center gap-2 ${isEditingZone ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-black/60 border-white/10 text-stone-400 hover:text-white'}`}
              title={isEditingZone ? "Lock Scan Area" : "Move Scan Area"}
            >
              <MapIcon className="w-5 h-5" />
              <span className="font-bold text-xs hidden sm:inline">{isEditingZone ? 'Lock Area' : 'Move Area'}</span>
            </button>
            <button 
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition((pos) => {
                    setScanCenter([pos.coords.latitude, pos.coords.longitude]);
                    setMapBounds(undefined);
                  });
                }
              }}
              className="p-3 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl hover:bg-black transition-all text-stone-400 hover:text-white shadow-2xl"
              title="My Location"
            >
              <Crosshair className="w-5 h-5" />
            </button>
            {result && (
              <button 
                onClick={() => setDrawerOpen(!drawerOpen)}
                className="p-3 bg-emerald-500 text-black rounded-2xl hover:bg-emerald-400 transition-all shadow-2xl flex items-center gap-2"
              >
                <TableIcon className="w-5 h-5" />
                <span className="font-bold text-xs hidden sm:inline">Results</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Map View */}
      <main className="flex-1 relative">
        <MapContainer 
          center={scanCenter} 
          zoom={13} 
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          
          <MapController center={scanCenter} zoom={13} bounds={mapBounds} />
          
          <ScanZone 
            center={scanCenter} 
            radius={scanRadius} 
            active={isEditingZone}
            onMove={(pos) => {
              setScanCenter(pos);
              setMapBounds(undefined);
            }} 
          />

          {isEditingZone && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1001] pointer-events-none">
              <div className="bg-emerald-500 text-black px-4 py-2 rounded-full font-bold text-xs shadow-2xl flex items-center gap-2 animate-pulse">
                <MapPin className="w-3 h-3" />
                Tap map to place scan area
              </div>
            </div>
          )}

          {result?.places.map((place, idx) => (
            place.lat && place.lng && (
              <Marker 
                key={idx} 
                position={[place.lat, place.lng]}
                icon={createAnimatedIcon()}
              >
                <Popup className="dark-popup">
                  <div className="p-3 min-w-[200px] bg-stone-900 text-white rounded-lg">
                    <h3 className="font-bold text-sm mb-1">{place.title}</h3>
                    <div className="flex items-center gap-1 text-[10px] text-stone-400 mb-3">
                      <MapPin className="w-3 h-3" />
                      {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
                    </div>
                    <a 
                      href={place.uri} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full py-2 bg-emerald-500 text-black text-[10px] font-bold rounded flex items-center justify-center gap-1 hover:bg-emerald-400 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" /> View on Maps
                    </a>
                  </div>
                </Popup>
              </Marker>
            )
          ))}
        </MapContainer>

        {/* Scanning Overlay */}
        <AnimatePresence>
          {loading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[2000] pointer-events-none flex items-center justify-center bg-black/20 backdrop-blur-[1px]"
            >
              <div className="relative text-center">
                <motion.div 
                  animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-64 h-64 rounded-full border-2 border-emerald-500/30 flex items-center justify-center mx-auto"
                >
                  <div className="w-48 h-48 rounded-full border border-emerald-500/20" />
                </motion.div>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mb-3" />
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em] mb-2">Analyzing Grid</p>
                  <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-emerald-500" animate={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-[9px] text-stone-500 font-mono mt-2">{Math.ceil(eta)}s remaining</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results Drawer */}
        <AnimatePresence>
          {drawerOpen && result && (
            <>
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 max-h-[70vh] sm:max-h-[85vh] bg-[#0a0a0a] border-t border-white/10 rounded-t-[32px] z-[1003] flex flex-col shadow-2xl pointer-events-auto"
              >
                <div className="flex items-center justify-between px-6 pt-4">
                  <div className="w-12 h-1.5 bg-white/10 rounded-full cursor-pointer" onClick={() => setDrawerOpen(false)} />
                  <button 
                    onClick={() => setDrawerOpen(false)}
                    className="p-2 hover:bg-white/5 rounded-full text-stone-500 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="p-6 sm:p-8 flex-1 overflow-y-auto custom-scrollbar">
                  <div className="max-w-5xl mx-auto space-y-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                          Scan Results
                          <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">
                            {result.places.length} Found
                          </span>
                        </h2>
                        <p className="text-sm text-stone-500 mt-1">Methodical area intelligence for "{query}" in {locationName}</p>
                      </div>
                      
                      <div className="relative">
                        <button 
                          onClick={() => setShowExportMenu(!showExportMenu)}
                          className="px-6 py-3 bg-white text-black font-bold rounded-xl flex items-center gap-2 hover:bg-stone-200 transition-all"
                        >
                          <Share2 className="w-4 h-4" /> Export Data
                        </button>
                        
                        <AnimatePresence>
                          {showExportMenu && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: 10 }}
                              className="absolute bottom-full right-0 mb-2 w-56 bg-stone-900 border border-white/10 rounded-2xl p-2 shadow-2xl z-50"
                            >
                              <div className="p-2 text-[10px] font-bold text-stone-500 uppercase tracking-widest border-b border-white/5 mb-1">Download</div>
                              <button onClick={exportJSON} className="w-full text-left p-3 hover:bg-white/5 rounded-xl flex items-center gap-3 text-sm">
                                <FileJson className="w-4 h-4 text-emerald-400" /> JSON File
                              </button>
                              <button onClick={exportMarkdown} className="w-full text-left p-3 hover:bg-white/5 rounded-xl flex items-center gap-3 text-sm">
                                <FileText className="w-4 h-4 text-blue-400" /> Markdown File
                              </button>
                              <button onClick={exportHTML} className="w-full text-left p-3 hover:bg-white/5 rounded-xl flex items-center gap-3 text-sm">
                                <FileText className="w-4 h-4 text-orange-400" /> HTML File
                              </button>
                              <div className="p-2 text-[10px] font-bold text-stone-500 uppercase tracking-widest border-b border-white/5 my-1">Copy to Clipboard</div>
                              <button onClick={() => copyToClipboard('json')} className="w-full text-left p-3 hover:bg-white/5 rounded-xl flex items-center gap-3 text-sm">
                                <Copy className="w-4 h-4 text-stone-400" /> Copy JSON
                              </button>
                              <button onClick={() => copyToClipboard('md')} className="w-full text-left p-3 hover:bg-white/5 rounded-xl flex items-center gap-3 text-sm">
                                <Copy className="w-4 h-4 text-stone-400" /> Copy Markdown
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      <div className="lg:col-span-1 space-y-6">
                        <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-4">Executive Summary</h3>
                          <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:text-stone-300">
                            <Markdown>{result.text}</Markdown>
                          </div>
                        </div>
                      </div>

                      <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest">Location Inventory</h3>
                          <button 
                            onClick={() => {
                              if (selectedPlaces.size === result.places.length) setSelectedPlaces(new Set());
                              else setSelectedPlaces(new Set(result.places.map((_, i) => i)));
                            }}
                            className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 uppercase tracking-wider"
                          >
                            {selectedPlaces.size === result.places.length ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        
                        <div className="space-y-3">
                          {result.places.map((place, idx) => (
                            <div 
                              key={idx}
                              onClick={() => togglePlaceSelection(idx)}
                              className={`p-4 bg-white/5 border rounded-2xl transition-all cursor-pointer flex items-center gap-4 ${selectedPlaces.has(idx) ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 hover:bg-white/10'}`}
                            >
                              <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedPlaces.has(idx) ? 'bg-emerald-500 border-emerald-500' : 'border-white/20'}`}>
                                {selectedPlaces.has(idx) && <CheckSquare className="w-3.5 h-3.5 text-black" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-white truncate">{place.title}</h4>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[10px] text-stone-500 font-mono">{place.lat?.toFixed(4)}, {place.lng?.toFixed(4)}</span>
                                  <span className="w-1 h-1 rounded-full bg-stone-700" />
                                  <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Verified</span>
                                </div>
                              </div>
                              <a 
                                href={place.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-stone-400 transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </main>

      {/* Copy Notification */}
      <AnimatePresence>
        {copyStatus && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[2001] bg-emerald-500 text-black px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-2"
          >
            <CheckSquare className="w-4 h-4" />
            {copyStatus}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global CSS */}
      <style dangerouslySetInnerHTML={{ __html: `
        .leaflet-container { background: #0a0a0a !important; }
        .dark-popup .leaflet-popup-content-wrapper {
          background: #1c1917 !important;
          color: white !important;
          border-radius: 12px !important;
          padding: 0 !important;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .dark-popup .leaflet-popup-content { margin: 0 !important; }
        .dark-popup .leaflet-popup-tip { background: #1c1917 !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
      `}} />
    </div>
  );
}
