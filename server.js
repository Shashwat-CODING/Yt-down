// server.js - Main Express server file
const express = require('express');
const bodyParser = require('body-parser');
const ytdl = require('@distube/ytdl-core');
const path = require('path');
const fs = require('fs');
const contentDisposition = require('content-disposition');

const app = express();
const PORT = process.env.PORT || 3000;

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to get video info
app.get('/videoInfo', async (req, res) => {
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

// Download video or audio
app.get('/download', async (req, res) => {
  const videoURL = req.query.url;
  const format = req.query.format; // mp4 or mp3
  const itag = req.query.itag; // specific format itag
  
  if (!videoURL) {
    return res.status(400).json({ error: 'Video URL is required' });
  }
  
  try {
    const info = await ytdl.getInfo(videoURL);
    const videoTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');
    
    if (format === 'mp3') {
      // For MP3, download the audio-only stream
      const fileName = `${videoTitle}.mp3`;
      res.header('Content-Disposition', contentDisposition(fileName));
      res.header('Content-Type', 'audio/mpeg');
      
      ytdl(videoURL, {
        quality: 'highestaudio',
        filter: 'audioonly'
      }).pipe(res);
    } else if (itag) {
      // For specific format using itag
      const selectedFormat = info.formats.find(f => f.itag === parseInt(itag));
      
      if (!selectedFormat) {
        return res.status(400).json({ error: 'Format not available' });
      }
      
      const fileExtension = selectedFormat.container || selectedFormat.mimeType?.split(';')[0].split('/')[1] || 'mp4';
      const fileName = `${videoTitle}.${fileExtension}`;
      
      res.header('Content-Disposition', contentDisposition(fileName));
      
      if (selectedFormat.hasVideo) {
        res.header('Content-Type', `video/${fileExtension}`);
      } else {
        res.header('Content-Type', `audio/${fileExtension}`);
      }
      
      ytdl(videoURL, {
        quality: itag
      }).pipe(res);
    } else {
      // Default to highest quality MP4
      const fileName = `${videoTitle}.mp4`;
      res.header('Content-Disposition', contentDisposition(fileName));
      res.header('Content-Type', 'video/mp4');
      
      ytdl(videoURL, {
        quality: 'highest',
        filter: 'audioandvideo'
      }).pipe(res);
    }
  } catch (error) {
    console.error("Download error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});