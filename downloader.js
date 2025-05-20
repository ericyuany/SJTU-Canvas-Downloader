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

        // Sort entries chronologically
        entries.sort((a, b) => new Date(a[1].time) - new Date(b[1].time));

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(0, 0, 0, 0.4);
            z-index: 99999; display: flex; justify-content: center; align-items: center;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: white; padding: 20px; border-radius: 8px;
            width: 550px; max-height: 80vh; overflow-y: auto;
            font-family: sans-serif; box-shadow: 0 0 10px rgba(0,0,0,0.3);
        `;

        const title = document.createElement('h3');
        title.textContent = `📋 Downloaded Files for Course ${COURSE_ID}`;
        box.appendChild(title);

        // Search input
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '🔍 Search by filename...';
        searchInput.style.cssText = `
            width: 100%; padding: 8px; margin-bottom: 12px;
            border-radius: 5px; border: 1px solid #ccc;
            font-size: 14px;
        `;
        box.appendChild(searchInput);

        // Container for file entries
        const fileList = document.createElement('div');
        box.appendChild(fileList);

        const renderFileList = (filter = '') => {
            fileList.innerHTML = ''; // clear
            let count = 0;

            entries.forEach(([id, data], index) => {
                if (!data.name.toLowerCase().includes(filter.toLowerCase())) return;

                const line = document.createElement('div');
                line.style.cssText = `margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;`;

                const label = document.createElement('div');
                label.innerHTML = `<strong>${data.name}</strong><br><small>🕒 ${data.time}</small>`;

                const delBtn = document.createElement('button');
                delBtn.innerHTML = "🗑️";
                delBtn.title = "Delete this file from record";
                delBtn.style.cssText = `
                    background: #ffdddd;
                    border: none;
                    font-size: 16px;
                    padding: 4px 8px;
                    border-radius: 5px;
                    cursor: pointer;
                    transition: background 0.2s;
                `;
                delBtn.onmouseenter = () => delBtn.style.background = "#ffaaaa";
                delBtn.onmouseleave = () => delBtn.style.background = "#ffdddd";
                delBtn.onclick = () => {
                    if (confirm(`Delete "${data.name}" from downloaded record?`)) {
                        delete map[id];
                        saveDownloadMap(map);
                        overlay.remove();
                        viewDownloadedIDs();  // re-render everything
                    }
                };

                line.appendChild(label);
                line.appendChild(delBtn);
                fileList.appendChild(line);
                count++;
            });

            if (count === 0) {
                fileList.innerHTML = `<i>No matching results.</i>`;
            }
        };

        // Initial render
        renderFileList();

        // Bind live filter
        searchInput.addEventListener('input', () => {
            renderFileList(searchInput.value);
        });

        const close = document.createElement('button');
        close.textContent = "Close";
        close.style.cssText = `
            margin-top: 15px;
            background: #333;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
        `;
        close.onclick = () => document.body.removeChild(overlay);

        box.appendChild(close);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
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
