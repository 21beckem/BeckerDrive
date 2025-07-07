class BeckerDriveInput {
    constructor(el) {
        this.el = el;
        this.el.addEventListener('click', this.selectFile.bind(this));
    }
    async selectFile(e) {
        e.preventDefault();
        let win = new SelectBeckerFile(this);
        let newFile = await win.promptFile();
        this.setFile(newFile.name, newFile.content, newFile.mimeType);
    }
    setFile(fileName, fileContent, mimeType) {
        const f = new File([fileContent], fileName, { type: mimeType });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(f);
        this.el.files = dataTransfer.files;
        this.el.dispatchEvent(new Event('change'));
    }
}
class SelectBeckerFile {
    constructor(bIn) {
        this.bIn = bIn;
    }
    promptFile() {
        this.popupWindow = window.open('https://21beckem.github.io/BeckerDrive/file-select.html', 'popup', 'width=400,height=300,location=no');
        this.popupWindow.resizeTo(800,600);
        this.popupWindow.moveTo(300, 100);
        this.popupWindow.focus();
        window.addEventListener('beforeunload', () => this.popupWindow.close());
        return new Promise((resolve, reject) => {
            window.addEventListener('message', (event) => {
                if (event.source === this.popupWindow) {
                    const data = event.data;
                    this.popupWindow.close();
                    resolve(data.file);
                }
            });
            this.popupWindow.addEventListener('load', () => {
                this.popupWindow.addEventListener('unload', () => {
                    reject( new Error('File Select Window Closed') );
                });
            });
        });
    }
}
document.querySelectorAll('input[type=file][beckerdrive]').forEach(el => new BeckerDriveInput(el));

class BeckerDrive {
    static saveFile(fileName, fileContent, mimeType) {
        this.popupWindow = window.open('https://21beckem.github.io/BeckerDrive/file-save.html', 'popup', 'width=400,height=300,location=no');
        this.popupWindow.resizeTo(800,600);
        this.popupWindow.moveTo(300, 100);
        this.popupWindow.focus();
        window.addEventListener('beforeunload', () => this.popupWindow.close());
        return new Promise((resolve, reject) => {
            window.addEventListener('message', (event) => {
                if (event.source === this.popupWindow) {
                    if (event.data.msg === 'ready') {
                        this.popupWindow.postMessage({ file: {
                            name: fileName,
                            content: fileContent,
                            mimeType: mimeType
                        } }, '*');
                    }
                    if (event.data.msg === 'saved') {
                        this.popupWindow.close();
                        resolve();
                    }
                }
            });
            this.popupWindow.addEventListener('load', () => {
                this.popupWindow.addEventListener('unload', () => {
                    reject( new Error('Save File Window Closed') );
                });
            });
        });
    }
}