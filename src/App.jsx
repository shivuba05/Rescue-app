import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  Fuel, AlertTriangle, Navigation, MapPin, 
  RefreshCw, CheckCircle, Phone, Wrench, 
  Droplet, Users, ChevronLeft, Save, Trash2, Clock, Search
} from 'lucide-react';

const createIcon = (color) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
const userIcon = createIcon('red');
const stationIcon = createIcon('blue');
const repairIcon = createIcon('orange');

function MapRecenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function App() {
  const [view, setView] = useState('home'); 
  const [vehicleType, setVehicleType] = useState('petrol'); 
  const [location, setLocation] = useState(null);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); 
  const [errorMsg, setErrorMsg] = useState('');
  const [searchRadius, setSearchRadius] = useState(5000); 
  const [currentSearchType, setCurrentSearchType] = useState('fuel');
  
  // Contacts
  const [contacts, setContacts] = useState(() => {
    const saved = localStorage.getItem('emergency_contacts');
    return saved ? JSON.parse(saved) : [];
  });
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  // Fuel Request
  const [fuelAmount, setFuelAmount] = useState('5 Liters');
  const [fuelMessage, setFuelMessage] = useState('Petrol required – stranded at current location.');

  // Manual Location
  const [manualAddress, setManualAddress] = useState('');
  const [isSearchingManual, setIsSearchingManual] = useState(false);

  // Debug Info
  const [debug, setDebug] = useState({
    secureContext: window.isSecureContext,
    geoSupported: 'geolocation' in navigator,
    permissionState: 'unknown',
    lastError: 'none',
    lat: null,
    lon: null
  });

  useEffect(() => {
    localStorage.setItem('emergency_contacts', JSON.stringify(contacts));
  }, [contacts]);

  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(res => {
        setDebug(prev => ({ ...prev, permissionState: res.state }));
        res.onchange = () => setDebug(prev => ({ ...prev, permissionState: res.state }));
      }).catch(() => {});
    }
  }, []);

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const executeSearch = async (lat, lon, radius, searchType) => {
    setStatus('searching');
    try {
      const response = await fetch('/api/overpass', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ lat, lon, radius, searchType, vehicleType })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.elements || data.elements.length === 0) {
        if (radius < 100000) {
          let nextRadius;
          if (radius < 15000) nextRadius = 15000;
          else if (radius < 50000) nextRadius = 50000;
          else nextRadius = 100000;

          setSearchRadius(nextRadius);
          return executeSearch(lat, lon, nextRadius, searchType);
        } else {
          setStatus('error_no_results');
          return;
        }
      }

      const items = data.elements.map(el => {
        const dist = calculateDistance(lat, lon, el.lat, el.lon);
        return {
          id: el.id,
          name: el.tags.name || el.tags.brand || (searchType === 'fuel' ? (vehicleType === 'ev' ? 'Charging Station' : 'Fuel Station') : 'Repair Shop'),
          lat: el.lat,
          lon: el.lon,
          distance: dist,
          address: el.tags['addr:street'] ? `${el.tags['addr:street']} ${el.tags['addr:city'] || ''}` : 'Address unavailable',
          phone: el.tags['phone'] || el.tags['contact:phone'] || null,
          opening_hours: el.tags['opening_hours'] || 'Status unknown'
        };
      }).sort((a, b) => a.distance - b.distance);

      setResults(items.slice(0, 15));
      setStatus('found');
      
    } catch (err) {
      console.error(err);
      setStatus('error_api');
      setErrorMsg(err.message || 'Network error communicating with server.');
      setDebug(prev => ({ ...prev, lastError: err.message }));
    }
  };

  const startLocationFlow = (searchType) => {
    setCurrentSearchType(searchType);
    setView('location_prompt');
  };

  const requestGPSLocation = () => {
    setStatus('locating');
    setErrorMsg('');
    setResults([]);
    
    if (!navigator.geolocation) {
      setStatus('error_unsupported');
      setDebug(prev => ({ ...prev, lastError: 'Geolocation not supported' }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lon: longitude });
        setSearchRadius(5000);
        setDebug(prev => ({ ...prev, lat: latitude, lon: longitude, lastError: 'none' }));
        setView(currentSearchType === 'fuel' ? 'results' : 'roadside');
        executeSearch(latitude, longitude, 5000, currentSearchType);
      },
      (error) => {
        setDebug(prev => ({ ...prev, lastError: `Code: ${error.code} - ${error.message}` }));
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            setStatus('error_permission');
            break;
          case error.POSITION_UNAVAILABLE:
            setStatus('error_unavailable');
            break;
          case error.TIMEOUT:
            setStatus('error_timeout');
            break;
          default:
            setStatus('error_unknown');
            break;
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleManualSearch = async () => {
    if (!manualAddress.trim()) return;
    setIsSearchingManual(true);
    setErrorMsg('');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(manualAddress)}&format=json&limit=1`);
      const data = await res.json();
      
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        setLocation({ lat, lon });
        setSearchRadius(5000);
        setDebug(prev => ({ ...prev, lat, lon, lastError: 'none' }));
        setView(currentSearchType === 'fuel' ? 'results' : 'roadside');
        executeSearch(lat, lon, 5000, currentSearchType);
      } else {
        alert("Location not found. Please try a different address or city.");
      }
    } catch (err) {
      alert("Failed to search manual location. Please check your internet connection.");
    } finally {
      setIsSearchingManual(false);
    }
  };

  const openNavigation = (lat, lon) => {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${location?.lat},${location?.lon}&destination=${lat},${lon}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const renderDebug = () => {
    if (!import.meta.env.DEV) return null;
    return (
      <div style={{ background: '#1e293b', padding: '1rem', marginTop: '2rem', borderRadius: '8px', border: '1px solid #334155', fontSize: '0.8rem', color: '#94a3b8' }}>
        <strong>DEV DEBUG INFO</strong><br/>
        GPS Supported: {debug.geoSupported ? 'Yes' : 'No'}<br/>
        Secure Context (HTTPS/localhost): {debug.secureContext ? 'Yes' : 'No'}<br/>
        Permission State: {debug.permissionState}<br/>
        Lat: {debug.lat || 'null'}, Lon: {debug.lon || 'null'}<br/>
        Last Error: <span style={{ color: '#ef4444' }}>{debug.lastError}</span>
      </div>
    );
  };

  // VIEWS
  const renderHome = () => (
    <div className="container" style={{ justifyContent: 'center' }}>
      <div className="header">
        <h1>FUEL RESCUE</h1>
        <p style={{ fontSize: '1.2rem', color: '#fff' }}>Stranded without fuel?</p>
      </div>

      <div className="vehicle-selector" style={{ marginBottom: '1rem' }}>
        <div className={`vehicle-option ${vehicleType === 'petrol' ? 'active' : ''}`} onClick={() => setVehicleType('petrol')}>
          🚗 <span>Petrol</span>
        </div>
        <div className={`vehicle-option ${vehicleType === 'diesel' ? 'active' : ''}`} onClick={() => setVehicleType('diesel')}>
          🚙 <span>Diesel</span>
        </div>
        <div className={`vehicle-option ${vehicleType === 'ev' ? 'active' : ''}`} onClick={() => setVehicleType('ev')}>
          ⚡ <span>EV</span>
        </div>
      </div>

      <div className="home-menu">
        <button className="menu-btn btn-danger" onClick={() => startLocationFlow('fuel')}>
          <AlertTriangle size={24} /> I'M OUT OF FUEL
        </button>
        <button className="menu-btn" onClick={() => startLocationFlow('fuel')}>
          <Fuel size={24} color="var(--secondary)" /> FIND NEARBY FUEL
        </button>
        <button className="menu-btn" onClick={() => startLocationFlow('repair')}>
          <Wrench size={24} color="var(--warning)" /> ROADSIDE ASSISTANCE
        </button>
        <button className="menu-btn" onClick={() => setView('request_fuel')}>
          <Droplet size={24} color="#0ea5e9" /> REQUEST EMERGENCY FUEL
        </button>
        <button className="menu-btn" onClick={() => setView('contacts')}>
          <Users size={24} color="#10b981" /> EMERGENCY CONTACTS
        </button>
      </div>
      {renderDebug()}
    </div>
  );

  const renderLocationPrompt = () => (
    <div className="container" style={{ justifyContent: 'center' }}>
      <div className="top-bar" style={{ position: 'absolute', top: '1.5rem', left: '1.5rem' }}>
        <button className="back-btn" onClick={() => setView('home')}><ChevronLeft size={24} /></button>
      </div>

      <div className="status-message glass">
        <MapPin size={48} color="var(--secondary)" />
        <h2 style={{ marginBottom: 0 }}>Location Required</h2>
        
        {!debug.secureContext ? (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--primary)' }}>
            <p style={{ color: 'var(--primary)', fontWeight: '600', margin: 0 }}>
              Location access requires HTTPS on this device/browser. Open the HTTPS version of this application to continue.
            </p>
          </div>
        ) : (
          <p>We need your GPS location to find the nearest {currentSearchType === 'fuel' ? 'fuel stations' : 'roadside assistance'} around you quickly.</p>
        )}

        <button 
          className="btn btn-primary" 
          style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginTop: '1rem' }}
          onClick={requestGPSLocation}
        >
          📍 Allow Location Access
        </button>
      </div>
      {renderDebug()}
    </div>
  );

  const renderManualFallback = () => (
    <div className="glass" style={{ padding: '1.5rem', marginTop: '1rem' }}>
      <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Search size={20} /> Enter Location Manually
      </h3>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input 
          type="text" 
          className="form-control" 
          placeholder="e.g., MG Road, Bangalore" 
          style={{ flex: 1 }}
          value={manualAddress}
          onChange={e => setManualAddress(e.target.value)}
        />
        <button 
          className="btn btn-primary" 
          onClick={handleManualSearch} 
          disabled={isSearchingManual || !manualAddress.trim()}
        >
          {isSearchingManual ? 'Searching...' : 'Search'}
        </button>
      </div>
    </div>
  );

  const renderErrorState = () => {
    let title = "Error";
    let message = "An error occurred.";

    if (status === 'error_permission') {
      title = "Permission Denied";
      message = "Location permission is disabled. Please enable Location permission for this browser/app and try again.";
    } else if (status === 'error_unavailable') {
      title = "Position Unavailable";
      message = "Your device could not determine your location. Please turn ON Location/GPS on your phone and allow this browser to access your location.";
    } else if (status === 'error_timeout') {
      title = "Timeout";
      message = "Location request timed out. Please try again.";
    } else if (status === 'error_unsupported') {
      title = "Not Supported";
      message = "Your browser does not support geolocation.";
    } else if (status === 'error_api') {
      title = "API Error";
      message = errorMsg;
    } else if (status === 'error_no_results') {
      title = "No Results";
      message = `No ${currentSearchType === 'fuel' ? 'petrol stations' : 'assistance providers'} found within 100km.`;
    } else if (status === 'error_unknown') {
      title = "Unknown Error";
      message = "Unable to get your location. Please try again.";
    }

    return (
      <div className="container" style={{ justifyContent: 'center' }}>
        <div className="top-bar" style={{ position: 'absolute', top: '1.5rem', left: '1.5rem' }}>
          <button className="back-btn" onClick={() => setView('home')}><ChevronLeft size={24} /></button>
        </div>
        <div className="status-message glass" style={{ borderColor: 'var(--primary)' }}>
          <AlertTriangle size={48} color="var(--primary)" />
          <h3 style={{ color: 'var(--primary)', marginBottom: 0 }}>{title}</h3>
          <p>{message}</p>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={requestGPSLocation}>
            <RefreshCw size={18} /> Try Again
          </button>
        </div>
        {renderManualFallback()}
        {renderDebug()}
      </div>
    );
  };

  const renderResults = (title, type) => (
    <div className="container">
      <div className="top-bar">
        <button className="back-btn" onClick={() => setView('home')}><ChevronLeft size={24} /></button>
        <h2 style={{ fontSize: '1.2rem', margin: 0 }}>{title}</h2>
        <button className="btn" style={{ marginLeft: 'auto', padding: '0.5rem' }} onClick={() => requestGPSLocation()}>
          <RefreshCw size={18} />
        </button>
      </div>

      {status === 'searching' && (
        <div className="status-message glass">
          <div className="spinner"></div>
          <h3>Searching within {searchRadius/1000}km...</h3>
        </div>
      )}

      {status === 'found' && (
        <>
          <div className="glass" style={{ padding: '0.75rem 1.25rem', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <CheckCircle size={20} color="var(--success)" />
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--success)' }}>Nearest locations found</h3>
            </div>
            {searchRadius > 5000 && (
              <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--warning)' }}>
                Showing {type === 'fuel' ? 'petrol stations' : 'assistance providers'} within {searchRadius/1000} km.
              </p>
            )}
          </div>

          {location && (
            <div className="map-container glass">
              <MapContainer center={[location.lat, location.lon]} zoom={13} scrollWheelZoom={false}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapRecenter center={[location.lat, location.lon]} zoom={13} />
                <Marker position={[location.lat, location.lon]} icon={userIcon}>
                  <Popup>You are here</Popup>
                </Marker>
                {results.map(item => (
                  <Marker key={item.id} position={[item.lat, item.lon]} icon={type === 'fuel' ? stationIcon : repairIcon}>
                    <Popup>{item.name} <br/> {item.distance.toFixed(1)} km away</Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}

          <div className="results-list">
            {results.map((item, index) => (
              <div key={item.id} className="station-card glass">
                <div className="station-header">
                  <div className="station-title">
                    {index + 1}. {item.name}
                  </div>
                  <div className="station-distance">📍 {item.distance.toFixed(1)} km</div>
                </div>
                
                <div className="station-info">
                  <div className="info-row">
                    <MapPin size={16} /> <span>{item.address}</span>
                  </div>
                  <div className="info-row">
                    <Phone size={16} /> 
                    <span style={{ color: item.phone ? '#fff' : 'var(--text-muted)' }}>
                      {item.phone || 'Number missing from database'}
                    </span>
                  </div>
                  <div className="info-row">
                    <Clock size={16} /> <span>{item.opening_hours}</span>
                  </div>
                </div>

                <div className="station-actions">
                  {item.phone ? (
                    <a 
                      href={`tel:${item.phone}`} 
                      className="btn btn-primary"
                      onClick={(e) => {
                        if (!window.confirm(`Call ${item.name} at ${item.phone}?`)) { e.preventDefault(); }
                      }}
                    >
                      <Phone size={18} /> CALL
                    </a>
                  ) : (
                    <a 
                      href={`https://www.google.com/search?q=${encodeURIComponent(item.name + ' ' + (item.address !== 'Address unavailable' ? item.address : 'petrol bunk'))}`} 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{ background: '#4b5563', borderColor: '#4b5563' }}
                    >
                      <Search size={18} /> SEARCH
                    </a>
                  )}
                  <button className="btn btn-success" onClick={() => openNavigation(item.lat, item.lon)}>
                    <Navigation size={18} /> GET DIRECTIONS
                  </button>
                </div>
              </div>
            ))}
          </div>
          {renderDebug()}
        </>
      )}
    </div>
  );

  const renderRequestFuel = () => (
    <div className="container">
      <div className="top-bar">
        <button className="back-btn" onClick={() => setView('home')}><ChevronLeft size={24} /></button>
        <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Request Emergency Fuel</h2>
      </div>
      <div className="glass" style={{ padding: '1.5rem' }}>
        <div className="form-group">
          <label>Fuel Type</label>
          <select className="form-control" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
            <option value="petrol">Petrol</option>
            <option value="diesel">Diesel</option>
            <option value="ev">Electric (Charge Request)</option>
          </select>
        </div>
        <div className="form-group">
          <label>Approximate Amount Required</label>
          <select className="form-control" value={fuelAmount} onChange={(e) => setFuelAmount(e.target.value)}>
            <option>2 Liters</option>
            <option>5 Liters</option>
            <option>10 Liters</option>
            <option>Full Tank</option>
          </select>
        </div>
        <div className="form-group">
          <label>Optional Message</label>
          <textarea className="form-control" rows="3" value={fuelMessage} onChange={(e) => setFuelMessage(e.target.value)}></textarea>
        </div>
        <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--warning)', borderRadius: '8px', marginBottom: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--warning)' }}>
            <strong>Note:</strong> Emergency fuel delivery is only available if a verified provider operates in your area. Your GPS location will be attached.
          </p>
        </div>
        <button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} onClick={() => { alert(`Fuel request submitted!`); setView('home'); }}>
          <Droplet size={20} /> SUBMIT REQUEST
        </button>
      </div>
    </div>
  );

  const renderContacts = () => (
    <div className="container">
      <div className="top-bar">
        <button className="back-btn" onClick={() => setView('home')}><ChevronLeft size={24} /></button>
        <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Emergency Contacts</h2>
      </div>
      <div className="glass" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Add Contact</h3>
        <div className="form-group">
          <input className="form-control" placeholder="Name" value={newContactName} onChange={e => setNewContactName(e.target.value)} />
        </div>
        <div className="form-group">
          <input className="form-control" type="tel" placeholder="Phone Number" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} />
        </div>
        <button className="btn btn-success" style={{ width: '100%' }} onClick={() => { if(newContactName && newContactPhone) { setContacts([...contacts, { id: Date.now(), name: newContactName, phone: newContactPhone }]); setNewContactName(''); setNewContactPhone(''); } }}>
          <Save size={18} /> Save Contact
        </button>
      </div>
      <div className="results-list">
        {contacts.length === 0 ? (
          <div className="glass" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No emergency contacts saved yet.</div>
        ) : contacts.map(c => (
          <div key={c.id} className="glass" style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{c.name}</div>
              <div style={{ color: 'var(--text-muted)' }}>{c.phone}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <a href={`tel:${c.phone}`} className="btn btn-primary" style={{ padding: '0.5rem', borderRadius: '50%' }} onClick={(e) => { if(!window.confirm(`Call ${c.name}?`)) e.preventDefault(); }}><Phone size={18} /></a>
              <button className="btn btn-danger" style={{ padding: '0.5rem', borderRadius: '50%' }} onClick={() => setContacts(contacts.filter(contact => contact.id !== c.id))}><Trash2 size={18} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (status.startsWith('error')) {
    return renderErrorState();
  }

  if (status === 'locating') {
    return (
      <div className="container" style={{ justifyContent: 'center' }}>
        <div className="status-message glass">
          <div className="spinner"></div>
          <h3>Acquiring GPS Signal...</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Please wait while we determine your exact location securely.</p>
        </div>
        {renderDebug()}
      </div>
    );
  }

  return (
    <div>
      {view === 'home' && renderHome()}
      {view === 'location_prompt' && renderLocationPrompt()}
      {view === 'results' && renderResults('🚨 Fuel Emergency', 'fuel')}
      {view === 'roadside' && renderResults('🛠️ Roadside Assistance', 'repair')}
      {view === 'request_fuel' && renderRequestFuel()}
      {view === 'contacts' && renderContacts()}
    </div>
  );
}
