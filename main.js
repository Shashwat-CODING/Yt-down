// main.js - Electron's main process file
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow;

// Create Express app
const expressApp = express();
const PORT = 3000;

// Middleware
expressApp.use(bodyParser.urlencoded({ extended: true }));
expressApp.use(bodyParser.json());
expressApp.use(express.static(path.join(__dirname, 'public')));

// API endpoint to get video info
expressApp.get('/videoInfo', async (req, res) => {
  const videoURL = req.query.url;
  
  if (!videoURL) {
    return res.status(400).json({ error: 'Video URL is required' });
  }
  
  try {
    const info = await ytdl.getInfo(videoURL);
    
    // Format the video information
    const formattedFormats = info.formats.map(format => {
      return {
        itag: format.itag,
        qualityLabel: format.qualityLabel,
        width: format.width,
        height: format.height,
        container: format.container || format.mimeType?.split(';')[0].split('/')[1] || 'unknown',
        contentLength: format.contentLength,
        hasVideo: !!format.qualityLabel,
        hasAudio: format.hasAudio,
        audioBitrate: format.audioBitrate,
        fps: format.fps
      };
    });
    
    res.json({
      title: info.videoDetails.title,
      thumbnailUrl: info.videoDetails.thumbnails[0].url,
      duration: info.videoDetails.lengthSeconds,
      author: info.videoDetails.author.name,
      formats: formattedFormats
    });
  } catch (error) {
    console.error("Error fetching video info:", error);
    res.status(400).json({ error: error.message });
  }
});

// Set up ipcMain to handle download requests
ipcMain.handle('download-video', async (event, { videoURL, itag, format }) => {
  try {
    const info = await ytdl.getInfo(videoURL);
    const videoTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');
    
    // Ask the user where to save the file
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Save Video',
      defaultPath: format === 'mp3' 
        ? path.join(app.getPath('downloads'), `${videoTitle}.mp3`)
        : path.join(app.getPath('downloads'), `${videoTitle}.mp4`),
      filters: format === 'mp3' 
        ? [{ name: 'Audio Files', extensions: ['mp3'] }]
        : [{ name: 'Video Files', extensions: ['mp4', 'webm', '3gp', 'mov'] }]
    });

    if (canceled) {
      return { success: false, message: 'Download cancelled' };
    }

    // Set up the download stream with appropriate options
    let downloadOptions = {};
    
    if (format === 'mp3') {
      downloadOptions = {
        quality: 'highestaudio',
        filter: 'audioonly'
      };
    } else if (itag) {
      downloadOptions = { quality: itag };
    } else {
      downloadOptions = {
        quality: 'highest',
        filter: 'audioandvideo'
      };
    }

    return new Promise((resolve, reject) => {
      const videoStream = ytdl(videoURL, downloadOptions);
      const fileStream = fs.createWriteStream(filePath);
      
      // Track download progress for potential UI updates
      let downloadedBytes = 0;
      const totalBytes = info.formats.find(f => f.itag === parseInt(itag))?.contentLength || '?';
      
      videoStream.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes !== '?') {
          const progress = (downloadedBytes / totalBytes * 100).toFixed(2);
          // You can send this progress to the renderer if you want
          mainWindow.webContents.send('download-progress', progress);
        }
      });
      
      fileStream.on('finish', () => {
        resolve({ success: true, filePath });
      });
      
      fileStream.on('error', (err) => {
        reject({ success: false, message: err.message });
      });
      
      videoStream.pipe(fileStream);
    });
  } catch (error) {
    console.error("Download error:", error);
    return { success: false, message: error.message };
  }
});

// Start the Express server
let server = expressApp.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icons/icon.png')
  });

  // Load the index.html from our Express server
  mainWindow.loadURL(`http://localhost:${PORT}`);
  
  // Open DevTools in development mode
  // mainWindow.webContents.openDevTools();

  // Set the window title
  mainWindow.setTitle('YouTube Video Downloader');

  // Create custom app menu
  const { Menu } = require('electron');
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'About',
      click: () => {
        dialog.showMessageBox({
          title: 'About YouTube Video Downloader',
          message: 'YouTube Video Downloader',
          detail: 'A desktop application to download YouTube videos and audio.\n\nVersion: 1.0.0'
        });
      }
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create window when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
  
  // Close the Express server
  server.close();
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open
  if (mainWindow === null) {
    createWindow();
  }
});

// Gracefully close the Express server when the app is closing
app.on('before-quit', () => {
  server.close();
});