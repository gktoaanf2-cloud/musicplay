// ============================================
// PAIR MUSIC BOX v3.0 — Editor ↔ Supabase Bridge
// v3.1: ARCH mode, shuffle, play-once, perf fixes
// ============================================

(function() {
    try { localStorage.removeItem('pair_music_box_v53'); } catch(e) {}

    var params = new URLSearchParams(window.location.search);
    var PL_ID = params.get('id');

    // --- Supabase Storage 업로드 ---
    async function uploadToStorage(file, path) {
        try {
            var ext = file.name.split('.').pop().toLowerCase();
            var fullPath = path + '.' + ext;
            var result = await _supabase.storage.from('covers').upload(fullPath, file, { upsert: true });
            if (result.error) return null;
            var urlResult = _supabase.storage.from('covers').getPublicUrl(fullPath);
            return urlResult.data.publicUrl;
        } catch(e) { return null; }
    }

    // --- DB 로드 ---
    async function loadFromDB() {
        var plR = await _supabase.from('playlists').select('*').eq('id', PL_ID).single();
        if (plR.error || !plR.data) return null;
        var pl = plR.data;
        var trR = await _supabase.from('tracks').select('*').eq('playlist_id', PL_ID).order('position');

        window.playlistData = (trR.data || []).map(function(t) {
            return { uid: t.id, videoId: t.video_id, title: t.title, image: t.image_url || undefined };
        });
        window.base64ImgData = pl.cover_image_url || '';
        window.currentFontSize = pl.font_size || 68;
        window.isBodoni = pl.is_bodoni || false;
        if (window.isBodoni) document.body.classList.add('font-bodoni'); else document.body.classList.remove('font-bodoni');

        var pn = document.getElementById('pair-name-display');
        if (pn) { pn.textContent = pl.pair_name || 'COSMIC_BOND'; pn.style.fontSize = window.currentFontSize + 'px'; }
        var st = document.getElementById('sub-title-display');
        if (st) st.textContent = pl.sub_title || 'RECORD OF OUR GALAXY';
        ['1','2','3','4'].forEach(function(n) {
            var val = pl['color_' + n];
            if (val) {
                var c = document.getElementById('config-color-' + n); if (c) c.value = val;
                document.documentElement.style.setProperty('--color-' + n, val);
                var w = document.getElementById('cp-wrap-' + n); if (w) w.style.backgroundColor = val;
            }
        });
        window.renderPlaylistUI(); window.changeLPImage(window.base64ImgData);
        if (window.resizeFit) window.resizeFit();
        return pl;
    }

    // --- DB 저장 (디바운스) ---
    var dbSaveTimer = null;
    function saveToSupabase() {
        clearTimeout(dbSaveTimer);
        dbSaveTimer = setTimeout(async function() {
            try {
                var data = window.getSiteData();
                await _supabase.from('playlists').update({
                    pair_name: data.pairName, sub_title: data.subTitle, font_size: data.fontSize,
                    is_bodoni: data.isBodoni, color_1: data.color1, color_2: data.color2,
                    color_3: data.color3, color_4: data.color4, cover_image_url: data.imageData || null
                }).eq('id', PL_ID);
                await _supabase.from('tracks').delete().eq('playlist_id', PL_ID);
                if (data.playlist.length > 0) {
                    await _supabase.from('tracks').insert(data.playlist.map(function(t, i) {
                        return { playlist_id: PL_ID, video_id: t.videoId, title: t.title, image_url: t.image || null, position: i };
                    }));
                }
            } catch(e) { console.error('Save error:', e); }
        }, 1000);
    }

    // --- 진행바 최적화 (rAF → 250ms 인터벌) ---
    var progressInterval = null;
    window.startProgressBar = function() {
        clearInterval(progressInterval);
        progressInterval = setInterval(function() {
            if (window.player && window.isPlaying && !window.isDraggingProgress && window.player.getCurrentTime) {
                try {
                    var c = window.player.getCurrentTime(), d = window.player.getDuration();
                    if (d > 0) {
                        var pf = document.getElementById('progress-fill'), td = document.getElementById('time-display');
                        if (pf) pf.style.width = (c / d) * 100 + '%';
                        if (td) td.textContent = window.formatTime(c) + ' / ' + window.formatTime(d);
                    }
                } catch(e) {}
            }
        }, 250);
    };
    var _origCancel = window.cancelAnimationFrame.bind(window);
    window.cancelAnimationFrame = function(id) { _origCancel(id); clearInterval(progressInterval); };

    // ===================== MAIN INIT =====================
    // 로딩 오버레이 (빈 에디터 숨김)
    var loadingOv = document.createElement('div');
    loadingOv.style.cssText = 'position:fixed;inset:0;z-index:999999;background:var(--color-4,#030305);display:flex;align-items:center;justify-content:center;transition:opacity 0.4s;';
    loadingOv.innerHTML = '<div style="width:8px;height:8px;background:#fff;transform:rotate(45deg);animation:spin-load 1s ease-in-out infinite;"></div><style>@keyframes spin-load{0%{transform:rotate(45deg) scale(1);opacity:1}50%{transform:rotate(225deg) scale(0.6);opacity:0.3}100%{transform:rotate(405deg) scale(1);opacity:1}}</style>';
    document.body.appendChild(loadingOv);
    function hideLoading() { loadingOv.style.opacity = '0'; setTimeout(function() { loadingOv.remove(); }, 400); }

    window.addEventListener('load', async function() {
        if (!PL_ID) { window.location.href = 'dashboard.html'; return; }

        // 병렬 요청: 인증 + 플레이리스트 + 트랙을 동시에 가져오기
        var results = await Promise.all([
            getCurrentUser(),
            _supabase.from('playlists').select('*').eq('id', PL_ID).single(),
            _supabase.from('tracks').select('*').eq('playlist_id', PL_ID).order('position')
        ]);

        var user = results[0];
        var plR = results[1];
        var trR = results[2];

        if (!user) { window.location.href = 'index.html'; return; }
        if (!plR.data || plR.data.user_id !== user.id) { alert('접근 권한이 없습니다.'); window.location.href = 'dashboard.html'; return; }

        // 데이터 적용
        var pl = plR.data;
        window.playlistData = (trR.data || []).map(function(t) {
            return { uid: t.id, videoId: t.video_id, title: t.title, image: t.image_url || undefined };
        });
        window.base64ImgData = pl.cover_image_url || '';
        window.currentFontSize = pl.font_size || 68;
        window.isBodoni = pl.is_bodoni || false;
        if (window.isBodoni) document.body.classList.add('font-bodoni'); else document.body.classList.remove('font-bodoni');
        var pn = document.getElementById('pair-name-display');
        if (pn) { pn.textContent = pl.pair_name || 'COSMIC_BOND'; pn.style.fontSize = window.currentFontSize + 'px'; }
        var st = document.getElementById('sub-title-display');
        if (st) st.textContent = pl.sub_title || 'RECORD OF OUR GALAXY';
        ['1','2','3','4'].forEach(function(n) {
            var val = pl['color_' + n];
            if (val) {
                var c = document.getElementById('config-color-' + n); if (c) c.value = val;
                document.documentElement.style.setProperty('--color-' + n, val);
                var w = document.getElementById('cp-wrap-' + n); if (w) w.style.backgroundColor = val;
            }
        });
        window.renderPlaylistUI(); window.changeLPImage(window.base64ImgData);
        if (window.resizeFit) window.resizeFit();
        hideLoading();

        // --- autoSave 오버라이드 ---
        window.autoSave = function() {
            try { localStorage.setItem('pair_music_box_v53', JSON.stringify(window.getSiteData())); } catch(e) {}
            saveToSupabase();
        };

        // --- SHARE → 링크 복사 ---
        window.exportHtml = function() {
            var base = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
            var url = base + 'viewer.html?id=' + PL_ID;
            navigator.clipboard.writeText(url).then(function() { alert('공유 링크 복사 완료!\n' + url); }).catch(function() { prompt('링크를 복사하세요:', url); });
        };

        // --- 이미지 업로드 오버라이드 ---
        window.handleLpUpload = async function(e) {
            var f = e.target.files[0]; if (!f) return;
            var url = await uploadToStorage(f, PL_ID + '/cover'); if (url) { window.base64ImgData = url; if (window.currentPlayingIndex === -1 || !window.playlistData[window.currentPlayingIndex] || !window.playlistData[window.currentPlayingIndex].image) window.changeLPImage(url); window.autoSave(); } e.target.value = '';
        };
        window.handleTrackUpload = async function(e) {
            var f = e.target.files[0]; if (!f || !window.editingTrackUid) return;
            var url = await uploadToStorage(f, PL_ID + '/track_' + window.editingTrackUid); if (url) { var idx = window.findTrackIndex(window.editingTrackUid); if (idx !== -1) { window.playlistData[idx].image = url; if (window.currentPlayingIndex === idx) window.changeLPImage(url); window.renderPlaylistUI(); window.autoSave(); } window.editingTrackUid = null; } e.target.value = '';
        };

        // ===================== 셔플 + 재생 모드 =====================
        var loopMode = 'all'; // 'all' | 'one' | 'once'
        var isShuffling = false;
        var playedSet = {};

        function resetPlayed() { playedSet = {}; }

        window.playNext = function() {
            if (!window.playlistData.length) return;
            var next;
            if (isShuffling) {
                var avail = [];
                for (var i = 0; i < window.playlistData.length; i++) { if (i !== window.currentPlayingIndex && !playedSet[i]) avail.push(i); }
                if (avail.length === 0) { if (loopMode === 'once') return; resetPlayed(); for (var i = 0; i < window.playlistData.length; i++) { if (i !== window.currentPlayingIndex) avail.push(i); } }
                next = avail[Math.floor(Math.random() * avail.length)];
            } else {
                next = (window.currentPlayingIndex + 1) % window.playlistData.length;
                if (next === 0 && loopMode === 'once') return;
            }
            playedSet[next] = true;
            window.playTrack(next);
        };

        window.isLooping = false;
        window.toggleLoop = function() {
            if (loopMode === 'all') { loopMode = 'one'; window.isLooping = true; }
            else if (loopMode === 'one') { loopMode = 'once'; window.isLooping = false; }
            else { loopMode = 'all'; window.isLooping = false; }
            resetPlayed(); updateModeUI();
        };

        function updateModeUI() {
            var lb = document.getElementById('btn-loop');
            if (lb) { lb.classList.toggle('active', loopMode !== 'all'); lb.title = loopMode === 'one' ? '한 곡 반복' : loopMode === 'once' ? '전체 1회' : '전체 반복'; }
            var sb = document.getElementById('btn-shuffle');
            if (sb) { sb.classList.toggle('active', isShuffling); }
            var mi = document.getElementById('mode-indicator');
            if (mi) { mi.textContent = (loopMode === 'one' ? '🔂' : loopMode === 'once' ? '➡️' : '🔁') + (isShuffling ? ' 🔀' : ''); }
        }

        // 셔플 버튼 추가
        var loopBtn = document.getElementById('btn-loop');
        if (loopBtn) {
            var shuffleBtn = document.createElement('button');
            shuffleBtn.className = 'control-btn'; shuffleBtn.id = 'btn-shuffle'; shuffleBtn.title = '셔플';
            shuffleBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:14px;height:14px;"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>';
            shuffleBtn.onclick = function() { isShuffling = !isShuffling; resetPlayed(); updateModeUI(); };
            loopBtn.parentNode.insertBefore(shuffleBtn, loopBtn.nextSibling);

            var modeSpan = document.createElement('span');
            modeSpan.id = 'mode-indicator';
            modeSpan.style.cssText = 'font-size:12px;opacity:0.5;margin-left:4px;';
            loopBtn.parentNode.insertBefore(modeSpan, shuffleBtn.nextSibling);
        }
        updateModeUI();

        // ===================== 상단 도구바 수정 =====================
        var tools = document.getElementById('editor-tools');
        if (tools) {
            var backBtn = document.createElement('button'); backBtn.className = 'text-btn'; backBtn.textContent = 'BACK';
            backBtn.style.cssText = 'color:var(--color-3);'; backBtn.onclick = function() { window.location.href = 'dashboard.html'; };
            tools.insertBefore(backBtn, tools.firstChild);
            var sep = document.createElement('span'); sep.className = 'tool-sep'; sep.textContent = '|'; tools.insertBefore(sep, backBtn.nextSibling);

            var dataCtrl = tools.querySelector('.data-controls'); if (dataCtrl) dataCtrl.style.display = 'none';
            if (dataCtrl && dataCtrl.previousElementSibling && dataCtrl.previousElementSibling.classList.contains('tool-sep')) dataCtrl.previousElementSibling.style.display = 'none';

            tools.querySelectorAll('.text-btn').forEach(function(b) { if (b.textContent.trim() === 'SHARE') b.textContent = 'LINK'; });

            // DEL IMG 버튼
            var shareBtn = null; tools.querySelectorAll('.text-btn').forEach(function(b) { if (b.textContent.trim() === 'LINK') shareBtn = b; });
            if (shareBtn) {
                var delImgBtn = document.createElement('button'); delImgBtn.className = 'text-btn reset-btn'; delImgBtn.textContent = 'DEL IMG'; delImgBtn.title = '기본 커버 삭제';
                delImgBtn.onclick = async function() { if (!window.base64ImgData) return; if (!confirm('기본 커버를 삭제하시겠습니까?')) return; window.base64ImgData = ''; window.changeLPImage(''); window.autoSave(); };
                shareBtn.parentNode.insertBefore(delImgBtn, shareBtn.nextSibling);
            }

            // ARCH 버튼
            var archBtn = document.createElement('button'); archBtn.className = 'text-btn'; archBtn.textContent = 'ARCH';
            archBtn.style.cssText = 'color:var(--color-1);text-shadow:0 0 8px var(--color-1);';
            archBtn.onclick = function() { openArchPanel(); };
            var linkSep = document.createElement('span'); linkSep.className = 'tool-sep'; linkSep.textContent = '|';
            tools.appendChild(linkSep); tools.appendChild(archBtn);
        }

        // ===================== ARCH 패널 =====================
        var archPanel = document.createElement('div'); archPanel.id = 'arch-panel';
        archPanel.style.cssText = 'display:none;position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.85);justify-content:center;align-items:center;opacity:0;transition:0.3s;';
        archPanel.innerHTML = '<div style="background:linear-gradient(135deg,rgba(15,15,20,0.95),rgba(5,5,10,0.9));backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);padding:40px 36px;width:560px;max-width:92vw;max-height:80vh;overflow-y:auto;position:relative;clip-path:polygon(0 0,calc(100% - 24px) 0,100% 24px,100% 100%,24px 100%,0 calc(100% - 24px));">' +
            '<button onclick="document.getElementById(\'arch-panel\').style.display=\'none\';document.getElementById(\'arch-panel\').style.opacity=\'0\';" style="position:absolute;top:16px;right:16px;background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);width:30px;height:30px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">✕</button>' +
            '<div style="font-family:Chakra Petch,sans-serif;font-size:12px;font-weight:600;letter-spacing:4px;color:var(--color-3);margin-bottom:6px;">ARCH // OST CATALOG</div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:24px;letter-spacing:1px;">클릭하면 현재 플레이리스트에 추가됩니다</div>' +
            '<div id="arch-track-list"></div>' +
            '<div id="arch-empty" style="text-align:center;padding:30px;color:rgba(255,255,255,0.3);font-size:12px;letter-spacing:2px;font-family:Chakra Petch,sans-serif;">관리자가 아직 트랙을 등록하지 않았습니다</div>' +
        '</div>';
        document.body.appendChild(archPanel);

        window.openArchPanel = async function() {
            archPanel.style.display = 'flex';
            setTimeout(function() { archPanel.style.opacity = '1'; }, 10);
            var listEl = document.getElementById('arch-track-list');
            var emptyEl = document.getElementById('arch-empty');
            listEl.innerHTML = '<div style="text-align:center;padding:20px;opacity:0.4;">로딩 중...</div>';
            emptyEl.style.display = 'none';

            var r = await _supabase.from('arch_tracks').select('*').order('category').order('position');
            var tracks = r.data || [];
            if (tracks.length === 0) { listEl.innerHTML = ''; emptyEl.style.display = 'block'; return; }

            var html = ''; var lastCat = '';
            tracks.forEach(function(t) {
                if (t.category !== lastCat) {
                    lastCat = t.category;
                    html += '<div style="font-family:Chakra Petch,sans-serif;font-size:10px;letter-spacing:3px;color:var(--color-3);margin:20px 0 10px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:6px;">' + (t.category || 'TRACKS') + '</div>';
                }
                html += '<div style="display:flex;align-items:center;padding:10px 12px;cursor:pointer;transition:0.3s;border-bottom:1px solid rgba(255,255,255,0.03);" onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'transparent\'" onclick="addArchTrack(\'' + t.video_id + '\',\'' + (t.title || '').replace(/'/g, "\\'") + '\')">' +
                    '<div style="width:4px;height:4px;background:#fff;transform:rotate(45deg);opacity:0.3;margin-right:14px;flex-shrink:0;"></div>' +
                    '<div style="flex:1;min-width:0;">' +
                        '<div style="font-size:13px;letter-spacing:-0.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (t.title || '') + '</div>' +
                        (t.artist ? '<div style="font-size:10px;color:var(--color-3);margin-top:2px;">' + t.artist + '</div>' : '') +
                    '</div>' +
                    '<div style="font-family:Chakra Petch,sans-serif;font-size:9px;letter-spacing:2px;color:var(--color-3);opacity:0.5;margin-left:10px;">+ ADD</div>' +
                '</div>';
            });
            listEl.innerHTML = html;
        };

        window.addArchTrack = function(videoId, title) {
            window.playlistData.push({ uid: window.generateUid(), videoId: videoId, title: title });
            window.renderPlaylistUI(); window.autoSave();
            // 피드백
            var listEl = document.getElementById('arch-track-list');
            var fb = document.createElement('div');
            fb.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.06);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.15);color:#fff;font-family:Chakra Petch,sans-serif;font-size:11px;letter-spacing:2px;padding:12px 24px;z-index:100001;transition:0.3s;';
            fb.textContent = '✓ ' + title + ' 추가됨';
            document.body.appendChild(fb);
            setTimeout(function() { fb.style.opacity = '0'; setTimeout(function() { fb.remove(); }, 300); }, 1500);
        };

        // 패널 바깥 클릭으로 닫기
        archPanel.addEventListener('click', function(e) { if (e.target === archPanel) { archPanel.style.display = 'none'; archPanel.style.opacity = '0'; } });
    });
})();
