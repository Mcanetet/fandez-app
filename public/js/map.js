window.FandezMap = {
  maps: {},
  markers: {},

  tileLayer: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  },

  _pinHtml(color) {
    return `<svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M16 1C9.1 1 4 6.45 4 13.4c0 8.55 11.2 20.95 11.55 21.35a1.2 1.2 0 0 0 1.7 0C17.6 34.35 28 22.15 28 13.4 28 6.45 22.9 1 16 1Z" fill="${color}" stroke="#FFFFFF" stroke-width="2.5"/>
      <circle cx="16" cy="13.5" r="5" fill="#FFFFFF"/>
    </svg>`;
  },

  _techHtml() {
    return `<div class="fandez-tech-marker" aria-hidden="true">
      <span class="fandez-tech-marker__pulse"></span>
      <span class="fandez-tech-marker__dot">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 11h18"/><path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/>
          <circle cx="7.5" cy="15.5" r="1.5"/><circle cx="16.5" cy="15.5" r="1.5"/>
          <path d="M5 11l1.5 4h11L19 11"/>
        </svg>
      </span>
    </div>`;
  },

  _destIcon() {
    return L.divIcon({
      className: 'fandez-map-pin',
      html: this._pinHtml('#C45C14'),
      iconSize: [32, 42],
      iconAnchor: [16, 42],
      popupAnchor: [0, -38]
    });
  },

  _providerIcon() {
    return L.divIcon({
      className: 'fandez-map-pin fandez-tech-pin',
      html: this._techHtml(),
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -18]
    });
  },

  _bindMarkerDrag(marker, mapId, onMarkerDrag) {
    marker.off('dragend');
    if (!onMarkerDrag) return;
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onMarkerDrag(pos.lat, pos.lng, mapId);
    });
  },

  _drawRoute(mapId, fromLat, fromLng, toLat, toLng) {
    const map = this.maps[mapId];
    if (!map || typeof L === 'undefined') return;
    const store = this.markers[mapId] || {};
    const latlngs = [
      [parseFloat(fromLat), parseFloat(fromLng)],
      [parseFloat(toLat), parseFloat(toLng)]
    ];
    if (store.route) {
      store.route.setLatLngs(latlngs);
    } else {
      store.route = L.polyline(latlngs, {
        color: '#C45C14',
        weight: 4,
        opacity: 0.85,
        dashArray: '8 10',
        lineCap: 'round'
      }).addTo(map);
    }
    this.markers[mapId] = store;
  },

  init(container, {
    lat,
    lng,
    label,
    zoom = 14,
    interactive = true,
    markerDraggable = false,
    onMarkerDrag
  } = {}) {
    if (!container || typeof L === 'undefined') return null;

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) return null;

    const mapId = container.id || `map-${Date.now()}`;
    container.id = mapId;

    if (this.maps[mapId]) {
      this.maps[mapId].remove();
      delete this.markers[mapId];
    }

    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
      dragging: interactive,
      scrollWheelZoom: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive
    }).setView([latitude, longitude], zoom);

    L.tileLayer(this.tileLayer.url, {
      attribution: this.tileLayer.attribution,
      subdomains: this.tileLayer.subdomains,
      maxZoom: this.tileLayer.maxZoom,
      detectRetina: true
    }).addTo(map);

    const marker = L.marker([latitude, longitude], {
      icon: this._destIcon(),
      draggable: markerDraggable
    }).addTo(map);
    if (label) marker.bindPopup(label);
    this._bindMarkerDrag(marker, mapId, onMarkerDrag);

    setTimeout(() => map.invalidateSize(), 300);
    setTimeout(() => map.invalidateSize(), 800);
    this.maps[mapId] = map;
    this.markers[mapId] = { destination: marker, onMarkerDrag };
    return map;
  },

  initTracking(container, { destLat, destLng, destLabel, providerLat, providerLng }) {
    this.init(container, { lat: destLat, lng: destLng, label: destLabel, zoom: 14 });
    const mapId = container.id;
    if (providerLat != null && providerLng != null && !isNaN(parseFloat(providerLat))) {
      this.updateProviderLocation(mapId, providerLat, providerLng, destLat, destLng);
    }
    return this.maps[mapId];
  },

  update(containerId, lat, lng, label, {
    zoom = 17,
    markerDraggable = false,
    onMarkerDrag
  } = {}) {
    const map = this.maps[containerId];
    if (!map) return;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    map.setView([latitude, longitude], zoom);
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
      if (layer instanceof L.Polyline && !(layer instanceof L.TileLayer)) map.removeLayer(layer);
    });
    const marker = L.marker([latitude, longitude], {
      icon: this._destIcon(),
      draggable: markerDraggable
    }).addTo(map);
    if (label) marker.bindPopup(label).openPopup();
    this._bindMarkerDrag(marker, containerId, onMarkerDrag);
    const store = this.markers[containerId] || {};
    store.destination = marker;
    store.onMarkerDrag = onMarkerDrag;
    store.provider = null;
    store.route = null;
    this.markers[containerId] = store;
    setTimeout(() => map.invalidateSize(), 100);
  },

  setMarkerDraggable(containerId, draggable, onMarkerDrag) {
    const store = this.markers[containerId];
    if (!store?.destination) return;
    store.destination.dragging[draggable ? 'enable' : 'disable']();
    store.onMarkerDrag = onMarkerDrag || store.onMarkerDrag;
    this._bindMarkerDrag(store.destination, containerId, store.onMarkerDrag);
  },

  enableMapPick(containerId, onPick, { draggable = true, onMarkerDrag } = {}) {
    const map = this.maps[containerId];
    if (!map) return;
    map.off('click.mapPick');
    map.on('click.mapPick', (event) => {
      const { lat, lng } = event.latlng;
      const store = this.markers[containerId] || {};
      const label = store.destination?.getPopup?.()?.getContent?.() || '';
      this.update(containerId, lat, lng, label, {
        zoom: Math.max(map.getZoom(), 18),
        markerDraggable: draggable,
        onMarkerDrag: onMarkerDrag || store.onMarkerDrag
      });
      if (onPick) onPick(lat, lng);
    });
  },

  disableMapPick(containerId) {
    const map = this.maps[containerId];
    if (!map) return;
    map.off('click.mapPick');
  },

  updateProviderLocation(containerId, lat, lng, destLat, destLng) {
    const map = this.maps[containerId];
    if (!map || typeof L === 'undefined') return;

    const plat = parseFloat(lat);
    const plng = parseFloat(lng);
    if (isNaN(plat) || isNaN(plng)) return;

    const store = this.markers[containerId] || {};

    if (store.provider) {
      store.provider.setLatLng([plat, plng]);
    } else {
      store.provider = L.marker([plat, plng], { icon: this._providerIcon() })
        .addTo(map)
        .bindPopup('Técnico en camino');
      this.markers[containerId] = store;
    }

    if (destLat != null && destLng != null && !isNaN(parseFloat(destLat))) {
      this._drawRoute(containerId, plat, plng, destLat, destLng);
      map.fitBounds(L.latLngBounds([[destLat, destLng], [plat, plng]]).pad(0.22));
    }
    setTimeout(() => map.invalidateSize(), 80);
  }
};

window.FundezMap = window.FandezMap;
