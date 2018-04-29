/* global: Vue, gapi */

const CLIENT_ID = '301384421951-0vqk0rt43qg09p8vq59ivvdsesr4uqqu.apps.googleusercontent.com';
const API_KEY = 'AIzaSyA4zeLGcFB2ZMOWF-jme4S07rpMYtMT-CI';

const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly'
].join(' ');
const GOOGLE_DRIVE_TYPES = {
    '.csv': 'application/vnd.google-apps.spreadsheet',
    '.xls': 'application/vnd.google-apps.spreadsheet',
    '.xlsx': 'application/vnd.google-apps.spreadsheet',
    '.doc': 'application/vnd.google-apps.document',
    '.docx': 'application/vnd.google-apps.document',
    '.ppt': 'application/vnd.google-apps.presentation',
    '.pptx': 'application/vnd.google-apps.presentation',
};

const convert = {
    blobToBase64Async(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                const dataUri = reader.result;
                resolve(dataUri.replace(/data:[^;]+;base64,/, ''));
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },
    binaryToBlob(binary, mimeType) {
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType });
    }
};

const vMessage = new Vue({
    el: '#message',
    data: {
        message: '',
        isActive: false,
        isError: false,
    },
    computed: {
        classes() {
            return {
                'message--active': this.message && this.isActive,
                'message--error': this.isError,
            };
        }
    },
    methods: {
        info(message) {
            this.message = message;
            this.isActive = true;
            this.isError = false;
        },
        error(message) {
            this.message = message;
            this.isActive = true;
            this.isError = true;
        },
        hide() {
            this.isActive = false;
            this.isError = false;
        }
    }
});

async function uploadToDriveAsync(file, fileType) {
    const boundary = '-----------' + Math.random().toString().slice(2);
    const fileData = await convert.blobToBase64Async(file);
    const metadata = {
        name: file.name,
        mimeType: fileType
    };
    const body = `
--${boundary}
content-type: application/json; charset=UTF-8

${JSON.stringify(metadata)}
--${boundary}
content-transfer-encoding: base64
content-type: ${fileType}

${fileData}
--${boundary}
--`;
    return await gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: {
            uploadType: 'multipart',
            fields: 'id, name, mimeType, iconLink'
        },
        headers: {
            'content-type': `multipart/related; boundary="${boundary}"`
        },
        body: body.replace(/\n/g, '\r\n')
    });
}

const vMain = new Vue({
    el: '#main',
    data: {
        isAuthorized: false,
        files: [],
        frameUrl: 'about:blank',
    },
    methods: {
        async initClient() {
            await gapi.client.init({
                apiKey: API_KEY,
                clientId: CLIENT_ID,
                discoveryDocs: DISCOVERY_DOCS,
                scope: SCOPES
            });
            const listener = this.updateSigninStatus.bind(this);
            gapi.auth2.getAuthInstance().isSignedIn.listen(listener);
            listener(gapi.auth2.getAuthInstance().isSignedIn.get());
        },
        async updateSigninStatus(isAuthorized) {
            this.isAuthorized = isAuthorized;
            if (isAuthorized) {
                const query = Object.values(GOOGLE_DRIVE_TYPES)
                    .map(type => `mimeType = "${type}"`)
                    .join(' or ');
                const response = await gapi.client.drive.files.list({
                    pageSize: 20,
                    q: query,
                    fields: 'files(id, name, mimeType, iconLink)',
                });
                this.files = response.result.files || [];
            }
        },
        authorize() {
            gapi.auth2.getAuthInstance().signIn();
        },
        signout() {
            gapi.auth2.getAuthInstance().signOut();
        },
        load(file) {
            vMessage.info('Loading...');
            return gapi.client.drive.files.export({
                fileId: file.id,
                mimeType: 'application/pdf'
            }).then(response => {
                const blob = convert.binaryToBlob(response.body, 'application/pdf');
                this.frameUrl = URL.createObjectURL(blob);
                document.title = `${file.name} - Yokoscense`;
                vMessage.hide();
            }).catch(response => {
                console.error(response);
                if (response.result && response.result.error && response.result.error.message) {
                    vMessage.error(response.result.error.message);
                } else {
                    vMessage.error('Unknown error');
                }
            });
        },
        async selectFile(ev) {
            const dataTransfer = ev.dataTransfer || ev.target;
            if (dataTransfer && dataTransfer.files && dataTransfer.files.length) {
                const file = dataTransfer.files[0];
                const extension = file.name.slice(file.name.lastIndexOf('.'));
                const fileType = GOOGLE_DRIVE_TYPES[extension];
                if (fileType) {
                    vMessage.info('Uploading...');
                    const response = await uploadToDriveAsync(file, fileType);
                    this.files.unshift(response.result);
                    await this.load(this.files[0]);
                } else {
                    vMessage.error(`Unsupported file type: ${extension}`);
                }
            }
        }
    }
});

const $dropzone = document.getElementById('dropzone');
document.body.addEventListener('dragenter', ev => {
    if (ev.dataTransfer.items.length) {
        if (ev.dataTransfer.items[0].kind === 'file') {
            $dropzone.classList.add('dropzone--active');
        }
    }
}, false);
$dropzone.addEventListener('dragleave', ev => {
    $dropzone.classList.remove('dropzone--active');
}, false);
$dropzone.addEventListener('drop', ev => {
    ev.preventDefault();
    $dropzone.classList.remove('dropzone--active');
    vMain.selectFile(ev);
}, false);
$dropzone.addEventListener('dragover', ev => ev.preventDefault(), false);

gapi.load('client:auth2', () => vMain.initClient());
