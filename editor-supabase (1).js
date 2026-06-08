// ============================================
// PAIR MUSIC BOX v3.2 — Editor ↔ Supabase Bridge
// 디자인 개선: 툴바 재배치, ARCH 갤러리, 모드 아이콘, 성능
// ============================================

(function() {
    try { localStorage.removeItem('pair_music_box_v53'); } catch(e) {}
    var params = new URLSearchParams(window.location.search);
    var PL_ID = params.get('id');

    async function uploadToStorage(file, path) {
        try { var ext = file.name.split('.').pop().toLowerCase(); var r = await _supabase.storage.from('covers').upload(path+'.'+ext, file, {upsert:true}); if(r.error)return null; return _supabase.storage.from('covers').getPublicUrl(path+'.'+ext).data.publicUrl; } catch(e){return null;}
    }

    var dbSaveTimer = null;
    function saveToSupabase() {
        clearTimeout(dbSaveTimer);
        dbSaveTimer = setTimeout(async function() {
            try {
                var d = window.getSiteData();
                await _supabase.from('playlists').update({pair_name:d.pairName,sub_title:d.subTitle,font_size:d.fontSize,is_bodoni:d.isBodoni,color_1:d.color1,color_2:d.color2,color_3:d.color3,color_4:d.color4,color_5:document.getElementById('config-color-5')?document.getElementById('config-color-5').value:'#ffffff',cover_image_url:d.imageData||null}).eq('id',PL_ID);
                await _supabase.from('tracks').delete().eq('playlist_id',PL_ID);
                if(d.playlist.length>0) await _supabase.from('tracks').insert(d.playlist.map(function(t,i){return{playlist_id:PL_ID,video_id:t.videoId,title:t.title,image_url:t.image||null,position:i};}));
            } catch(e){}
        },1000);
    }

    // 진행바 최적화
    var progressInterval=null;
    window.startProgressBar=function(){clearInterval(progressInterval);progressInterval=setInterval(function(){if(window.player&&window.isPlaying&&!window.isDraggingProgress&&window.player.getCurrentTime){try{var c=window.player.getCurrentTime(),d=window.player.getDuration();if(d>0){var pf=document.getElementById('progress-fill'),td=document.getElementById('time-display');if(pf)pf.style.width=(c/d)*100+'%';if(td)td.textContent=window.formatTime(c)+' / '+window.formatTime(d);}}catch(e){}}},250);};
    var _origCancel=window.cancelAnimationFrame.bind(window);
    window.cancelAnimationFrame=function(id){_origCancel(id);clearInterval(progressInterval);};

    // ===================== 로딩 오버레이 =====================
    var loadingOv=document.createElement('div');
    loadingOv.style.cssText='position:fixed;inset:0;z-index:999999;background:var(--color-4,#030305);display:flex;align-items:center;justify-content:center;transition:opacity 0.4s;';
    loadingOv.innerHTML='<div style="width:8px;height:8px;background:#fff;transform:rotate(45deg);animation:ld 1s ease-in-out infinite;"></div><style>@keyframes ld{0%{transform:rotate(45deg) scale(1);opacity:1}50%{transform:rotate(225deg) scale(.6);opacity:.3}100%{transform:rotate(405deg) scale(1);opacity:1}}</style>';
    document.body.appendChild(loadingOv);
    function hideLoading(){loadingOv.style.opacity='0';setTimeout(function(){loadingOv.remove();},400);}

    // ===================== MAIN INIT =====================
    window.addEventListener('load', async function() {
        if(!PL_ID){window.location.href='dashboard.html';return;}
        var results=await Promise.all([getCurrentUser(),_supabase.from('playlists').select('*').eq('id',PL_ID).single(),_supabase.from('tracks').select('*').eq('playlist_id',PL_ID).order('position')]);
        var user=results[0],plR=results[1],trR=results[2];
        if(!user){window.location.href='index.html';return;}
        if(!plR.data||plR.data.user_id!==user.id){alert('접근 권한이 없습니다.');window.location.href='dashboard.html';return;}

        var pl=plR.data;
        window.playlistData=(trR.data||[]).map(function(t){return{uid:t.id,videoId:t.video_id,title:t.title,image:t.image_url||undefined};});
        window.base64ImgData=pl.cover_image_url||'';window.currentFontSize=pl.font_size||68;window.isBodoni=pl.is_bodoni||false;
        if(window.isBodoni)document.body.classList.add('font-bodoni');else document.body.classList.remove('font-bodoni');
        var pn=document.getElementById('pair-name-display');if(pn){pn.textContent=pl.pair_name||'COSMIC_BOND';pn.style.fontSize=window.currentFontSize+'px';}
        var st=document.getElementById('sub-title-display');if(st)st.textContent=pl.sub_title||'RECORD OF OUR GALAXY';
        ['1','2','3','4'].forEach(function(n){var v=pl['color_'+n];if(v){var c=document.getElementById('config-color-'+n);if(c)c.value=v;document.documentElement.style.setProperty('--color-'+n,v);var w=document.getElementById('cp-wrap-'+n);if(w)w.style.backgroundColor=v;}});
        if(pl.color_5)document.documentElement.style.setProperty('--color-5',pl.color_5);
        window.renderPlaylistUI();window.changeLPImage(window.base64ImgData);if(window.resizeFit)window.resizeFit();
        hideLoading();

        // --- autoSave ---
        window.autoSave=function(){try{localStorage.setItem('pair_music_box_v53',JSON.stringify(window.getSiteData()));}catch(e){}saveToSupabase();};
        window.exportHtml=function(){var base=window.location.origin+window.location.pathname.replace(/\/[^\/]*$/,'/');var url=base+'viewer.html?id='+PL_ID;navigator.clipboard.writeText(url).then(function(){toast('공유 링크 복사 완료!');}).catch(function(){prompt('링크:',url);});};
        window.handleLpUpload=async function(e){var f=e.target.files[0];if(!f)return;var url=await uploadToStorage(f,PL_ID+'/cover');if(url){window.base64ImgData=url;if(window.currentPlayingIndex===-1||!window.playlistData[window.currentPlayingIndex]||!window.playlistData[window.currentPlayingIndex].image)window.changeLPImage(url);window.autoSave();}e.target.value='';};
        window.handleTrackUpload=async function(e){var f=e.target.files[0];if(!f||!window.editingTrackUid)return;var url=await uploadToStorage(f,PL_ID+'/track_'+window.editingTrackUid);if(url){var idx=window.findTrackIndex(window.editingTrackUid);if(idx!==-1){window.playlistData[idx].image=url;if(window.currentPlayingIndex===idx)window.changeLPImage(url);window.renderPlaylistUI();window.autoSave();}window.editingTrackUid=null;}e.target.value='';};

        // ===================== 셔플 + 재생 모드 =====================
        var loopMode='all',isShuffling=false,playedSet={};
        function resetPlayed(){playedSet={};}

        window.playNext=function(){
            if(!window.playlistData.length)return;var next;
            if(isShuffling){var a=[];for(var i=0;i<window.playlistData.length;i++){if(i!==window.currentPlayingIndex&&!playedSet[i])a.push(i);}if(a.length===0){if(loopMode==='once')return;resetPlayed();for(var i=0;i<window.playlistData.length;i++){if(i!==window.currentPlayingIndex)a.push(i);}}next=a[Math.floor(Math.random()*a.length)];}
            else{next=(window.currentPlayingIndex+1)%window.playlistData.length;if(next===0&&loopMode==='once')return;}
            playedSet[next]=true;window.playTrack(next);
        };
        window.isLooping=false;
        window.toggleLoop=function(){
            if(loopMode==='all'){loopMode='one';window.isLooping=true;}else if(loopMode==='one'){loopMode='once';window.isLooping=false;}else{loopMode='all';window.isLooping=false;}
            resetPlayed();updateModeUI();
        };

        // 모드 UI (이모지 대신 깔끔한 SVG 아이콘)
        function updateModeUI(){
            var lb=document.getElementById('btn-loop');
            if(lb){lb.classList.toggle('active',loopMode!=='all');lb.title=loopMode==='one'?'한 곡 반복':loopMode==='once'?'전체 1회':'전체 반복';}
            // 루프 버튼 안에 모드 표시
            var badge=document.getElementById('loop-badge');
            if(!badge){badge=document.createElement('span');badge.id='loop-badge';badge.style.cssText='position:absolute;top:-4px;right:-6px;font-size:8px;font-weight:700;font-family:Chakra Petch,sans-serif;color:var(--color-1);pointer-events:none;letter-spacing:0;';lb.style.position='relative';lb.appendChild(badge);}
            badge.textContent=loopMode==='one'?'1':loopMode==='once'?'1×':'';
            var sb=document.getElementById('btn-shuffle');if(sb)sb.classList.toggle('active',isShuffling);
        }

        // 셔플 버튼 (루프 옆)
        var loopBtn=document.getElementById('btn-loop');
        if(loopBtn){
            var shBtn=document.createElement('button');shBtn.className='control-btn';shBtn.id='btn-shuffle';shBtn.title='셔플';
            shBtn.innerHTML='<svg viewBox="0 0 24 24" style="width:14px;height:14px;"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>';
            shBtn.onclick=function(){isShuffling=!isShuffling;resetPlayed();updateModeUI();};
            loopBtn.parentNode.insertBefore(shBtn,loopBtn.nextSibling);
        }
        updateModeUI();

        // ===================== 상단 도구바 재배치 =====================
        var tools=document.getElementById('editor-tools');
        if(tools){
            // BACK → 좌상단 분리
            var backEl=document.createElement('button');
            backEl.style.cssText='position:absolute;top:40px;left:50px;z-index:999999;background:transparent;border:none;color:rgba(255,255,255,0.35);font-size:11px;cursor:pointer;transition:0.3s;font-family:inherit;text-transform:uppercase;letter-spacing:2px;font-weight:600;';
            backEl.textContent='← BACK';
            backEl.onmouseover=function(){this.style.color='var(--color-1)';};
            backEl.onmouseout=function(){this.style.color='rgba(255,255,255,0.35)';};
            backEl.onclick=function(){window.location.href='dashboard.html';};
            document.getElementById('export-target').appendChild(backEl);

            // data-controls(OUT/IN/RESET) + separator 숨기기
            var dc=tools.querySelector('.data-controls');if(dc){dc.style.display='none';if(dc.previousElementSibling&&dc.previousElementSibling.classList.contains('tool-sep'))dc.previousElementSibling.style.display='none';}

            // SHARE → LINK
            tools.querySelectorAll('.text-btn').forEach(function(b){if(b.textContent.trim()==='SHARE')b.textContent='LINK';});

            // font/color 사이 separator 제거 (하나로 합침)
            var fc=tools.querySelector('.font-controls');var cc=tools.querySelector('.color-controls');
            if(fc&&cc){var sepBetween=fc.nextElementSibling;if(sepBetween&&sepBetween.classList.contains('tool-sep'))sepBetween.style.display='none';}

            // FONT 버튼을 A-/A+ 앞으로 이동
            if(fc){var fontBtn=null;fc.querySelectorAll('.text-btn').forEach(function(b){if(b.textContent.trim()==='FONT')fontBtn=b;});if(fontBtn)fc.insertBefore(fontBtn,fc.firstChild);}

            // ARCH 버튼 (LINK 앞에 삽입)
            var linkBtn=null;tools.querySelectorAll('.text-btn').forEach(function(b){if(b.textContent.trim()==='LINK')linkBtn=b;});
            if(linkBtn){
                var archSep=document.createElement('span');archSep.className='tool-sep';archSep.textContent='|';
                var archBtn=document.createElement('button');archBtn.className='text-btn';archBtn.textContent='ARCH';
                archBtn.style.cssText='color:var(--color-1);text-shadow:0 0 8px rgba(255,255,255,0.4);';
                archBtn.onclick=function(){openArchPanel();};
                linkBtn.parentNode.insertBefore(archSep,linkBtn);
                linkBtn.parentNode.insertBefore(archBtn,linkBtn);
                var linkSep2=document.createElement('span');linkSep2.className='tool-sep';linkSep2.textContent='|';
                linkBtn.parentNode.insertBefore(linkSep2,linkBtn);
            }

            // DEL IMG → 툴바 아래, 작게
            var delRow=document.createElement('div');
            delRow.style.cssText='position:absolute;top:68px;right:50px;z-index:999999;';
            var delBtn=document.createElement('button');
            delBtn.style.cssText='background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:9px;cursor:pointer;transition:0.3s;font-family:inherit;letter-spacing:1.5px;font-weight:600;text-transform:uppercase;';
            delBtn.textContent='DEL COVER';delBtn.title='기본 커버 삭제';
            delBtn.onmouseover=function(){this.style.color='#ff3366';};
            delBtn.onmouseout=function(){this.style.color='rgba(255,255,255,0.2)';};
            delBtn.onclick=async function(){if(!window.base64ImgData)return;if(!confirm('기본 커버를 삭제하시겠습니까?'))return;window.base64ImgData='';window.changeLPImage('');window.autoSave();};
            delRow.appendChild(delBtn);
            document.getElementById('export-target').appendChild(delRow);
        }

        // ===================== 5번째 색상 (UI 컨트롤) =====================
        var uiColor = pl.color_5 || '#ffffff';
        document.documentElement.style.setProperty('--color-5', uiColor);

        // UI 색상 적용 CSS 주입
        var uiStyle = document.createElement('style'); uiStyle.id = 'ui-color-style';
        uiStyle.textContent = '.control-btn svg{fill:var(--color-5)!important;}.play-pause-btn svg{fill:var(--color-5)!important;}.progress-fill{background:linear-gradient(90deg,var(--color-5),var(--color-3))!important;box-shadow:0 0 10px var(--color-5)!important;}.progress-fill::after{background:var(--color-5)!important;box-shadow:0 0 10px var(--color-5)!important;}.diamond-mark{background:var(--color-5)!important;}.track-item.playing{color:var(--color-5)!important;text-shadow:0 0 15px var(--color-5)!important;}.track-item.playing .diamond-mark{box-shadow:0 0 8px var(--color-5)!important;}.track-item.playing .diamond-mark::before{border-color:var(--color-5)!important;}.track-item:hover .diamond-mark{box-shadow:0 0 8px var(--color-5)!important;}.track-item.playing::after{background:linear-gradient(90deg,transparent 0%,var(--color-5) 50%,transparent 100%)!important;box-shadow:0 0 8px 1px var(--color-5)!important;}.volume-wrapper svg{fill:var(--color-5)!important;}.volume-slider::-webkit-slider-thumb{background:var(--color-5)!important;box-shadow:0 0 10px var(--color-5)!important;}#current-track-name{color:var(--color-5)!important;}.wave-ring{border-color:var(--color-5)!important;}.lp-halo-ring{background:conic-gradient(from 0deg,var(--color-5),transparent 20%,var(--color-2) 40%,transparent 60%,var(--color-3) 80%,var(--color-5))!important;}';
        document.head.appendChild(uiStyle);

        // 5번째 컬러 피커 추가
        var cc = tools.querySelector('.color-controls');
        if (cc) {
            var wrap5 = document.createElement('div'); wrap5.className = 'color-picker-wrapper'; wrap5.id = 'cp-wrap-5';
            wrap5.style.cssText = 'background-color:'+uiColor+';border:1px solid rgba(255,255,255,0.3);';
            var inp5 = document.createElement('input'); inp5.type = 'color'; inp5.id = 'config-color-5'; inp5.value = uiColor;
            inp5.style.cssText = 'position:absolute;top:-15px;left:-15px;width:45px;height:45px;cursor:pointer;border:none;transform:rotate(-45deg);opacity:0;pointer-events:auto!important;';
            inp5.oninput = function() { document.documentElement.style.setProperty('--color-5', this.value); wrap5.style.backgroundColor = this.value; window.autoSave(); };
            wrap5.appendChild(inp5); cc.appendChild(wrap5);
        }

        // ===================== ARCH 패널 (갤러리형) =====================
        var archPanel=document.createElement('div');archPanel.id='arch-panel';
        archPanel.style.cssText='display:none;position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.8);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);justify-content:center;align-items:flex-start;opacity:0;transition:0.3s;overflow-y:auto;padding:60px 20px;';
        archPanel.innerHTML='<div style="width:680px;max-width:96vw;position:relative;margin:auto;">'+
            '<button id="arch-close" style="position:absolute;top:0;right:0;background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);width:30px;height:30px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:0.3s;">✕</button>'+
            '<div style="font-family:Chakra Petch,sans-serif;font-size:13px;font-weight:700;letter-spacing:5px;color:var(--color-1);margin-bottom:4px;">ARCH</div>'+
            '<div style="font-family:Chakra Petch,sans-serif;font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:2px;margin-bottom:28px;">OFFICIAL SOUNDTRACK CATALOG</div>'+
            '<div id="arch-grid"></div>'+
            '<div id="arch-empty" style="text-align:center;padding:50px 20px;color:rgba(255,255,255,0.25);font-size:12px;letter-spacing:2px;font-family:Chakra Petch,sans-serif;">관리자가 아직 트랙을 등록하지 않았습니다<br><span style="font-size:10px;opacity:0.6;margin-top:8px;display:inline-block;">Supabase → Table Editor → arch_tracks</span></div>'+
        '</div>';
        document.body.appendChild(archPanel);
        document.getElementById('arch-close').onclick=function(){archPanel.style.opacity='0';setTimeout(function(){archPanel.style.display='none';},300);};
        archPanel.addEventListener('click',function(e){if(e.target===archPanel){archPanel.style.opacity='0';setTimeout(function(){archPanel.style.display='none';},300);}});

        window.openArchPanel=async function(){
            archPanel.style.display='flex';setTimeout(function(){archPanel.style.opacity='1';},10);
            var grid=document.getElementById('arch-grid'),empty=document.getElementById('arch-empty');
            grid.innerHTML='<div style="text-align:center;padding:30px;opacity:0.3;">로딩 중...</div>';empty.style.display='none';
            var r=await _supabase.from('arch_tracks').select('*').order('category').order('position');
            var tracks=r.data||[];
            if(tracks.length===0){grid.innerHTML='';empty.style.display='block';return;}

            var html='',lastCat='';
            tracks.forEach(function(t){
                if(t.category!==lastCat){lastCat=t.category;html+='<div style="font-family:Chakra Petch,sans-serif;font-size:10px;letter-spacing:3px;color:var(--color-3);margin:24px 0 12px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:8px;">'+((t.category||'TRACKS').toUpperCase())+'</div>';}
                var imgSrc=t.image_url||('https://img.youtube.com/vi/'+t.video_id+'/mqdefault.jpg');
                html+='<div class="arch-item" data-vid="'+t.video_id+'" data-title="'+(t.title||'').replace(/"/g,'&quot;')+'" style="cursor:pointer;">'+
                    '<div style="width:100%;aspect-ratio:16/9;overflow:hidden;background:#111;"><img src="'+imgSrc+'" style="width:100%;height:100%;object-fit:cover;opacity:0.85;transition:0.3s;" onerror="this.style.display=\'none\'"></div>'+
                    '<div style="padding:8px 2px 0;"><div style="font-size:12px;font-weight:500;letter-spacing:-0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+(t.artist||'')+'</div>'+
                    '<div style="font-size:10px;color:var(--color-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+(t.title||'')+'</div></div></div>';
            });
            grid.innerHTML='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">'+html+'</div>';
            // 이벤트 위임
            grid.querySelectorAll('.arch-item').forEach(function(el){
                el.onmouseover=function(){var img=el.querySelector('img');if(img)img.style.opacity='1';};
                el.onmouseout=function(){var img=el.querySelector('img');if(img)img.style.opacity='0.85';};
                el.onclick=function(){
                    var vid=el.getAttribute('data-vid'),ttl=el.getAttribute('data-title');
                    window.playlistData.push({uid:window.generateUid(),videoId:vid,title:ttl});
                    window.renderPlaylistUI();window.autoSave();
                    toast('✓ '+ttl+' 추가됨');
                };
            });
        };

        function toast(msg){var t=document.createElement('div');t.style.cssText='position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.06);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.15);color:#fff;font-family:Chakra Petch,sans-serif;font-size:11px;letter-spacing:2px;padding:12px 24px;z-index:100001;transition:0.3s;';t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.style.opacity='0';setTimeout(function(){t.remove();},300);},1500);}
    });
})();
