// Push Notification Service Worker Extension

// Handle push events
self.addEventListener('push', (event) => {
  console.log('[Push SW] Push notification received', event);

  if (!event.data) {
    console.log('[Push SW] No data in push event');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('[Push SW] Failed to parse push data:', e);
    data = {
      title: 'Neue Benachrichtigung',
      body: event.data.text(),
    };
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/pwa-192x192.png',
    tag: data.tag || 'default',
    vibrate: [100, 50, 100],
    data: data.data || {},
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Benachrichtigung', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[Push SW] Notification clicked', event);

  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there's already a window open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          // Focus existing window and navigate
          return client.focus().then((focusedClient) => {
            if ('navigate' in focusedClient) {
              return focusedClient.navigate(urlToOpen);
            }
          });
        }
      }
      // Open new window if none exists
      return clients.openWindow(urlToOpen);
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[Push SW] Notification closed', event);
});

// Handle push subscription change
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[Push SW] Push subscription changed', event);

  // The subscription has changed, the app needs to re-subscribe
  // This typically happens when the browser's push service rotates keys
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options).then((subscription) => {
      // Send the new subscription to the server
      // This would need to be handled by posting to the app
      console.log('[Push SW] Re-subscribed successfully');
    }).catch((error) => {
      console.error('[Push SW] Failed to re-subscribe:', error);
    })
  );
});

console.log('[Push SW] Push notification service worker extension loaded');
