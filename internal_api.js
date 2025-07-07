const BeckerDrive = (() => {
	class GoogleDrive {
		constructor(
			apiKey = 'AIzaSyAodjpoWJ5bMh-AFhhYw3iKm-S9K7p7Ofk',
			clientId = '459674057056-rkd8emkua47ec7lv5ffivn5j0t5lfgii.apps.googleusercontent.com',
			folderName = 'BeckerDrive'
		) {
			this.API_KEY = apiKey;
			this.CLIENT_ID = clientId;
			this.SCOPES = 'https://www.googleapis.com/auth/drive.file';
			this.FOLDER_NAME = folderName;
	
			this.tokenClient = null;
			this.gapiInited = false;
			this.gisInited = false;
			this.accessToken = null;
	
			// Bind handlers
			this.handleGapiLoad = this.handleGapiLoad.bind(this);
			this.handleGisLoad = this.handleGisLoad.bind(this);
			this.login = this.login.bind(this);
	
			// Insert script tags for GAPI & GIS
			this.injectScripts();
		}
	
		injectScripts() {
			// Google Identity Services
			const gisScript = document.createElement('script');
			gisScript.src = 'https://accounts.google.com/gsi/client';
			gisScript.async = true;
			gisScript.defer = true;
			gisScript.onload = this.handleGisLoad;
			document.head.appendChild(gisScript);
	
			// Google API Client Library
			const gapiScript = document.createElement('script');
			gapiScript.src = 'https://apis.google.com/js/api.js';
			gapiScript.async = true;
			gapiScript.defer = true;
			gapiScript.onload = this.handleGapiLoad;
			document.head.appendChild(gapiScript);
		}
	
		// Called when gapi.js loads
		handleGapiLoad() {
			gapi.load('client', async () => {
				await gapi.client.init({
					apiKey: this.API_KEY,
					discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
				});
				this.gapiInited = true;
			});
		}
		// Called when google.accounts.gsi.js loads
		handleGisLoad() {
			this.tokenClient = google.accounts.oauth2.initTokenClient({
				client_id: this.CLIENT_ID,
				scope: this.SCOPES,
				callback: (resp) => {
					if (resp.error) {
						console.error('Auth error:', resp.error);
						return;
					}
					this.accessToken = resp.access_token;
				}
			});
			this.gisInited = true;
		}
	
		isReady() {
			return this.gapiInited && this.gisInited;
		}

		attemptAutoLogin() {
			const savedToken = localStorage.getItem('gdrive_access_token');
			const expiresAt  = parseInt(localStorage.getItem('gdrive_token_expires'), 10);
			if (!savedToken || Date.now() >= expiresAt) {
				return false;
			}
			if (!this.isReady()) {
				const interval = setInterval(() => {
					if (this.isReady()) {
						clearInterval(interval);
						this.login();
					}
				}, 100);
			}
			return true;
		}
	
		// Prompts user to authorize and retrieves token
		async login() {
			if (!this.isReady()) throw new Error('GAPI or GIS not initialized');
			
			// get saved token if available
			const savedToken = localStorage.getItem('gdrive_access_token');
			const expiresAt  = parseInt(localStorage.getItem('gdrive_token_expires'), 10);
			if (savedToken && Date.now() < expiresAt) {
				gapi.client.setToken({ access_token: savedToken });
				this.accessToken = savedToken;
				return;
			}
	
			return new Promise((resolve, reject) => {
				this.tokenClient.callback = (resp) => {
					if (resp.error) return reject(resp);
					this.accessToken = resp.access_token;
					localStorage.setItem('gdrive_access_token', resp.access_token);
					localStorage.setItem('gdrive_token_expires', Date.now() + resp.expires_in * 1000);
					resolve(resp);
				};
				this.tokenClient.requestAccessToken({ prompt: 'consent' });
			});
		}

		async getUserProfile() {
			if (!this.accessToken) { await this.login(); }
			const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
				headers: {
				Authorization: `Bearer ${this.accessToken}`
				}
			});
			if (!res.ok) throw new Error('Failed to fetch user profile');
			const profile = await res.json();
			return {
				name: profile.name,
				email: profile.email,
				picture: profile.picture // ← this is the avatar URL
			};
		}

	
		// List files in BeckerSuite folder (optionally by filename)
		async listFiles( name = null ) {
			if (!this.accessToken) { await this.login(); }
			const folderId = await this.getOrCreateFolder();
			let q = `'${folderId}' in parents and trashed=false`;
			if (name) q += ` and name='${name}'`;
			const res = await gapi.client.drive.files.list({
				q,
				fields: 'files(id, name, mimeType, modifiedTime)'
			});
			return res.result.files;
		}
	
		// Uploads or updates a file in BeckerSuite
		async uploadFile( fileName, fileContent, mimeType ) {
			if (!this.accessToken) { await this.login(); }
			const folderId = await this.getOrCreateFolder();
			
			const blob = new Blob([fileContent], { type: mimeType });
			const metadata = new FormData();
			metadata.append('metadata', new Blob([
				JSON.stringify({ name: fileName, parents: [folderId] })
			], { type: mimeType }));
			metadata.append('file', blob);
	
			const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
				method: 'POST',
				headers: new Headers({ 'Authorization': `Bearer ${this.accessToken}` }),
				body: metadata
			});
	
			const result = await response.json();
			console.log('Uploaded file ID:', result.id);
	
			return result.id;
		}
	
		async downloadFile(fileId) {
			if (!this.accessToken) { await this.login(); }
			const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
			const res = await fetch(url, {
			method: 'GET',
			headers: new Headers({ Authorization: `Bearer ${this.accessToken}` }),
			});
			if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
			return await res.text();
		}
	
		// Internal: get or create folder
		async getOrCreateFolder() {
			if (this.folderId) { return this.folderId }
			if (!this.accessToken) { await this.login(); }
	
			const res = await gapi.client.drive.files.list({
				q: `mimeType='application/vnd.google-apps.folder' and name='${this.FOLDER_NAME}' and trashed=false`,
				fields: 'files(id)',
				spaces: 'drive'
			});
			if (res.result.files.length) return res.result.files[0].id;
	
			const folder = await gapi.client.drive.files.create({
				resource: { name: this.FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
				fields: 'id'
			});
	
			this.folderId = folder.result.id;
			return this.folderId;
		}
	}
	return new GoogleDrive();
})();