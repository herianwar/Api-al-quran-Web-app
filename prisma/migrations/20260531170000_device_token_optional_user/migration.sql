-- Allow anonymous (not-logged-in) devices to register for push notifications.
-- userId becomes nullable; a null row is an anonymous device that can later be
-- claimed by a user when the same FCM token re-registers via the auth endpoint.
ALTER TABLE "device_tokens" ALTER COLUMN "userId" DROP NOT NULL;
