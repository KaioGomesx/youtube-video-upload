const express = require("express");
const google = require("googleapis").google;
const youtube = google.youtube({ version: "v3" });
const OAuth2 = google.auth.OAuth2;
const fs = require("fs");

async function main() {
  await authenticateWithOAuth();
  const videoInformation = await uploadVideo();
  await uploadThumbnail(videoInformation);

  async function authenticateWithOAuth() {
    const webServer = await startWebServer();
    const OAuthClient = await createOAuthClient();
    requestUserConsent(OAuthClient);
    const authorizationToken = await waitForGoogleCallback(webServer);
    await requestGoogleForAccessToken(OAuthClient, authorizationToken);
    setGlobalGoogleAuthentication(OAuthClient);
    await stopWebServer(webServer);

    async function startWebServer() {
      return new Promise((resolve, reject) => {
        const port = 5000;
        const app = express();

        const server = app.listen(port, () => {
          console.log(`[*] Listening on http://localhost:${port}`);

          resolve({
            app,
            server,
          });
        });
      });
    }

    async function createOAuthClient() {
      const credentials = require("../credentials/client_secret.json");

      const OAuthClient = new OAuth2(
        credentials.web.client_id,
        credentials.web.client_secret,
        credentials.web.redirect_uris[0]
      );

      return OAuthClient;
    }

    function requestUserConsent(OAuthClient) {
      const consentUrl = OAuthClient.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/youtube"],
      });

      console.log(`> Please give your consent: ${consentUrl}`);
    }

    async function waitForGoogleCallback(webServer) {
      return new Promise((resolve, reject) => {
        console.log("[*] Waiting for user consent");

        webServer.app.get("/oauth2callback", (req, res) => {
          const authCode = req.query.code;
          console.log(`[*] Consent given: ${authCode}`);

          res.send("<h1>Thank you!</h1><p>Now close this tab.</p>");

          resolve(authCode);
        });
      });
    }

    async function requestGoogleForAccessToken(
      OAuthClient,
      authorizationToken
    ) {
      return new Promise((resolve, reject) => {
        OAuthClient.getToken(authorizationToken, (error, tokens) => {
          if (error) return reject(error);

          console.log("[*] Access tokens received:");
          console.log(tokens);

          OAuthClient.setCredentials(tokens);
          resolve();
        });
      });
    }

    function setGlobalGoogleAuthentication(OAuthClient) {
      google.options({
        auth: OAuthClient,
      });
    }

    async function stopWebServer(webServer) {
      return new Promise((resolve, reject) => {
        webServer.server.close(() => {
          resolve();
        });
      });
    }
  }

  async function uploadVideo() {
    const videoFilePath = "./videos/video.mp4";
    const videoFileSize = fs.statSync(videoFilePath).size;
    const videoTitle = "Teste de upload";
    const videoTags = ["fon", "fon2", "fon3"];
    const videoDescription = "Descrição braba";

    const requestParameters = {
      part: "snippet, status",
      requestBody: {
        snippet: {
          title: videoTitle,
          description: videoDescription,
          tags: videoTags,
        },
        status: {
          privacyStatus: "unlisted",
        },
      },
      media: {
        body: fs.createReadStream(videoFilePath),
      },
    };

    function onUploadProgress(event) {
      const progress = Math.round((event.bytesRead / videoFileSize) * 100);
      console.log(`[!] ${progress}% completed`);
    }

    const youtubeResponse = await youtube.videos.insert(requestParameters, {
      onUploadProgress,
    });

    console.log(
      `[*] Video Available at: http://youtu.be/${youtubeResponse.data.id}`
    );

    return youtubeResponse.data;
  }

  async function uploadThumbnail(videoInformation) {
    const videoId = videoInformation.id;
    const videoThumbnailFilePath = "./videos/thumb.png";

    const requestParameters = {
      videoId: videoId,
      media: {
        mimeType: "image/png",
        body: fs.createReadStream(videoThumbnailFilePath),
      },
    };

    const youtubeResponse = await youtube.thumbnails.set(requestParameters);
    console.log("[*] Thumbnail uploaded!");
  }
}

main();
