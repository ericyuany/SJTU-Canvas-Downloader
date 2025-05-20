// ==UserScript==
// @name         Canvas File Downloader v3 (Full Features)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Download new Canvas files by course, preserve folder structure, view history
// @match        https://oc.sjtu.edu.cn/courses/*/files*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @connect      oc.sjtu.edu.cn
// ==/UserScript==

(function () {
    'use strict';

    const COURSE_ID = window.location.pathname.match(/courses\/(\d+)/)[1];
    const STORAGE_KEY = `canvas_downloaded_file_map_${COURSE_ID}`;
    const COURSE_FOLDER = COURSE_ID;
    const API_FILES = `https://oc.sjtu.edu.cn/api/v1/courses/${COURSE_ID}/files?per_page=100`;
    const API_FOLDERS = `https://oc.sjtu.edu.cn/api/v1/folders/`;

    const folderPathCache = {};

    function sanitizePath(path) {
        return path.replace(/[:*?"<>|\\]/g, "_");
    }

    function loadDownloadMap() {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    }

    function saveDownloadMap(map) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }

    function resetDownloadMap() {
        localStorage.removeItem(STORAGE_KEY);
        alert(`🗑️ Download history for course ${COURSE_ID} cleared.`);
    }

    function viewDownloadedIDs() {
        const map = loadDownloadMap();
        const entries = Object.entries(map);

        if (entries.length === 0) {
            alert("No files have been downloaded yet.");
            return;
        }

        entries.sort((a, b) => new Date(a[1].time) - new Date(b[1].time));

        const lines = entries.map(([id, data], i) =>
            `${i + 1}. 📄 ${data.name}\n   🕒 ${data.time}`
        );

        alert(`Downloaded Files for course ${COURSE_ID}:\n\n${lines.join('\n\n')}`);
    }

    function getFolderPath(folder_id, callback) {
        if (folder_id == null) return callback('');
        if (folderPathCache[folder_id]) return callback(folderPathCache[folder_id]);

        GM_xmlhttpRequest({
            method: 'GET',
            url: API_FOLDERS + folder_id,
            headers: { 'Accept': 'application/json' },
            onload: function (res) {
                if (res.status === 200) {
                    const folder = JSON.parse(res.responseText);
                    getFolderPath(folder.parent_folder_id, (parentPath) => {
                        const fullPath = parentPath + folder.name + '/';
                        folderPathCache[folder_id] = fullPath;
                        callback(fullPath);
                    });
                } else {
                    console.error("❌ Failed to fetch folder:", res);
                    callback('');
                }
            }
        });
    }

    function fetchCanvasFiles(callback) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: API_FILES,
            headers: { 'Accept': 'application/json' },
            onload: function (res) {
                if (res.status === 200) {
                    callback(JSON.parse(res.responseText));
                } else {
                    alert("❌ Failed to load file list.");
                }
            }
        });
    }

    function checkAndDownload() {
        const downloadedMap = loadDownloadMap();

        fetchCanvasFiles(files => {
            const newFiles = files.filter(f => !(f.id in downloadedMap));
            if (newFiles.length === 0) {
                alert("✅ No new files found.");
                return;
            }

            let completed = 0;
            newFiles.forEach(file => {
                getFolderPath(file.folder_id, folderPath => {
                    const relativePath = sanitizePath(`${COURSE_FOLDER}/${folderPath}${file.display_name}`);
                    console.log("📥 Downloading:", relativePath);

                    GM_download({
                        url: file.url,
                        name: relativePath,
                        onerror: () => alert(`❌ Failed to download ${file.display_name}`)
                    });

                    // Save with readable name and time
                    downloadedMap[file.id] = {
                        name: file.display_name,
                        time: new Date().toLocaleString()
                    };

                    completed++;
                    if (completed === newFiles.length) {
                        saveDownloadMap(downloadedMap);
                        alert(`✅ Downloaded ${completed} new file(s).`);
                    }
                });
            });
        });
    }

    // Tampermonkey menu
    GM_registerMenuCommand("📥 Check & Download New Files", checkAndDownload);
    GM_registerMenuCommand("📋 View Downloaded Files", viewDownloadedIDs);
    GM_registerMenuCommand("🗑️ Reset Download History", resetDownloadMap);

})();
