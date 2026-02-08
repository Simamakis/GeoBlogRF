import React, { useEffect, useRef } from 'react';
import { projectManager } from '../services/projectManager';
import { useContentStore } from '../stores/contentStore';
import { mapFacade } from '../services/map_facade/index';
import useMapDisplayMode from '../hooks/useMapDisplayMode';

const PersistentMapBackground: React.FC = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const leftContent = useContentStore((s) => s.leftContent);
  // ВАЖНО: Фон только для map, НЕ для planner
  // Planner имеет свою собственную карту через projectManager.initializeMap в компоненте Planner
  // Если инициализировать фон для planner, будет конфликт двух карт
  const isMapOnly = leftContent === 'map';
  const initializedRef = React.useRef(false);

  useEffect(() => {
    let mounted = true;
    if (!ref.current) return () => { mounted = false; };

    const el = ref.current;

    // Инициализируем фон один раз — либо когда пользователь открыл карту (map) — активный фон,
    // либо когда открыт только Posts/Activity (одноколонный режим) — пассивный фон (без маркеров/событий)
    // Planner имеет свою карту (Yandex) — не инициализируем Leaflet в этом случае
    const displayMode = useMapDisplayMode();
    const isPassiveBackground = displayMode.isOnlyPostsAndActivity;

    if (initializedRef.current || !(isMapOnly || isPassiveBackground)) return () => { mounted = false; };

    const initIfSized = async () => {
      try {
        const hasSize = () => el && el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).visibility !== 'hidden' && window.getComputedStyle(el).display !== 'none';

        if (!hasSize()) {
          await new Promise<void>((resolve) => {
            let resolved = false;
            const ro = (window as any).ResizeObserver ? new (window as any).ResizeObserver(() => {
              if (!resolved && hasSize()) {
                resolved = true;
                try { ro.disconnect(); } catch (e) {}
                resolve();
              }
            }) : null;

            if (ro) {
              try { ro.observe(el); } catch (e) { /* ignore */ }
            }

            const to = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                try { ro && ro.disconnect(); } catch (e) {}
                resolve();
              }
            }, 1200);

            if (hasSize()) {
              clearTimeout(to);
              resolved = true;
              try { ro && ro.disconnect(); } catch (e) {}
              resolve();
            }
          });
        }

        if (!mounted) return;

        try {
          const api = await projectManager.initializeMap(el, {
            provider: 'leaflet',
            center: [55.7558, 37.6176],
            zoom: 10,
            markers: [],
            routes: []
          });

          if (api) {
            try {
              // If we are in passive background mode (Posts/Activity single-pane), register as passive
              // so other consumers can detect it and avoid attaching markers/events to this background.
              if (isPassiveBackground) {
                const bgApi = { map: (api as any).map ?? api, passive: true };
                mapFacade().registerBackgroundApi?.(bgApi);
              } else {
                mapFacade().registerBackgroundApi?.(api);
              }
            } catch (e) { /* ignore */ }
          }

          initializedRef.current = true;
        } catch (err) {
          console.warn('PersistentMapBackground: mapFacade init failed', err);
        }
      } catch (err) {
        // ignore
      }
    };

    initIfSized();

    return () => { mounted = false; };
  }, [isMapOnly]);

  return (
    <div
      ref={ref}
      className="persistent-map-bg"
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        // Показываем фон только для map, скрываем для planner (у него своя карта)
        opacity: isMapOnly ? 1 : (leftContent === 'planner' ? 0 : 0.85),
        transition: 'opacity 300ms ease'
      }}
    />
  );
};

export default PersistentMapBackground;
