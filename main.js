let currentEvents = [];
// 通知重複防止用
let lastNotifiedMinute = -1;
let lastActiveIndex = -1; // スクロール暴れ防止用
let clipboardData = null; // 時間割コピー用

function applyTheme() {
  const isDark = localStorage.getItem('theme') === 'dark';
  document.body.classList.toggle('dark-mode', isDark);
  
  const btn = document.getElementById('theme-toggle-idx');
  if(btn) btn.innerText = isDark ? "☀️" : "🌙";
}

function renderTimeline(events, day) {
  const container = document.getElementById('timeline');
  const eventBox = document.getElementById('event-display');
  container.innerHTML = '';
  currentEvents = events;

  const dayEvent = localStorage.getItem(`event_${day}`);
  if(dayEvent) {
    eventBox.innerText = "📢 今日の予定: " + dayEvent;
    eventBox.classList.remove('hidden');
  } else {
    eventBox.classList.add('hidden');
  }

  // データがない、またはタイトルがすべて空の場合
  if (!events || events.length === 0 || events.every(e => !e.title)) {
    container.innerHTML = `
      <div style="text-align:center; padding:50px; color:#888;">
        <p>講義の予定はありません ☕️</p>
        <p style="font-size:0.8rem;">下の「✏️時間割変更」から追加できます</p>
      </div>`;
    return;
  }

  events.forEach((ev, i) => {
    if(!ev.title) return;
    const div = document.createElement('div');
    div.className = 'timeline-item';
    div.id = `class-${i}`;
    // 教室名の表示を調整
    const roomText = ev.room ? `📍 ${ev.room}` : '📍 未設定';
    
    div.innerHTML = `
      <div style="font-size:0.75rem; color:#888;">${ev.time} - ${ev.end}</div>
      <div style="font-weight:bold; font-size:1.05rem; margin:3px 0;">${ev.title}</div>
      <div style="font-size:0.8rem; color:var(--accent-color);">${roomText}</div>
    `;
    container.appendChild(div);
  });
  updateAllHighlights();
}

function sendSystemNotification(title, room) {
  // システム通知（ロック画面・通知センター）
  if (localStorage.getItem('systemNotifEnabled') === 'true') {
    if (Notification.permission === 'granted') {
      new Notification("授業開始のお知らせ", {
        body: `${title} が始まります\n場所: ${room || '教室未設定'}`,
        icon: 'favicon.ico' // アイコンがあれば設定可能
      });
    }
  }

  // アプリ内ポップアップ
  if (localStorage.getItem('popupEnabled') === 'true' && Notification.permission === 'granted') {
    // 重複を避けるため、システム通知がOFFの場合だけブラウザ標準通知を出すなどの制御も可能だが、
    // ここではご要望通りポップアップ（既存機能）として動作させます。
    // ※実際のブラウザでは「new Notification」自体がポップアップになるため、上記と重複する場合があります。
    // そのため、ここは「アプリ独自のアラート」を出すか、Web NotificationAPIに一本化するのがモダンです。
    // 今回は整合性を保つため、システム通知が許可されていない場合のみ代替手段としてアラート等は出しません（うるさくなるため）。
  }
}

function updateAllHighlights() {
  const isHighOn = localStorage.getItem('highlightEnabled') !== 'false';
  const isScrollOn = localStorage.getItem('scrollEnabled') === 'true';
  const now = new Date();
  const currentTotal = now.getHours() * 60 + now.getMinutes();
  const currentMinuteStamp = now.getHours() + ":" + now.getMinutes(); // 分単位のスタンプ
  
  let activeFound = false;
  
  currentEvents.forEach((ev, i) => {
    const el = document.getElementById(`class-${i}`);
    if (!el || !ev.time || !ev.end) return;
    
    const [sh, sm] = ev.time.split(':').map(Number);
    const [eh, em] = ev.end.split(':').map(Number);
    const startTotal = sh * 60 + sm;
    const endTotal = eh * 60 + em;
    
    const isActive = currentTotal >= startTotal && currentTotal < endTotal;
    
    // ハイライト切り替え
    el.classList.toggle('active-class-border', isHighOn && isActive);
    
    if(isActive) {
      activeFound = true;
      // スクロール処理: アクティブな授業が変わったタイミングでのみスクロール
      if(isScrollOn && lastActiveIndex !== i) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lastActiveIndex = i;
      }
    }

    // 通知ロジック: 開始時刻ぴったり かつ まだこの分に通知していない場合
    if (currentTotal === startTotal && lastNotifiedMinute !== currentTotal) {
      sendSystemNotification(ev.title, ev.room);
      lastNotifiedMinute = currentTotal; // この分はもう通知しない
    }
  });

  // 授業時間外になったらインデックスをリセット
  if(!activeFound) {
    lastActiveIndex = -1;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();

  // --- 自動で今日に戻る処理 ---
  const dateIn = document.getElementById('date-select');
  if (dateIn) {
    const savedDate = localStorage.getItem('tempDate');
    if (savedDate) {
      dateIn.value = savedDate;
      localStorage.removeItem('tempDate'); // 一回使ったら消す
    } else {
      dateIn.value = new Date().toLocaleDateString('sv-SE');
    }
  }

  // テーマ切り替えボタン
  const themeBtnIdx = document.getElementById('theme-toggle-idx');
  if (themeBtnIdx) {
    themeBtnIdx.onclick = () => {
      const isNowDark = !document.body.classList.contains('dark-mode');
      localStorage.setItem('theme', isNowDark ? 'dark' : 'light');
      applyTheme();
    };
  }

  // 通知バッジ制御
  const badge = document.getElementById('notification-badge');
  if (badge) {
    const isNotifOn = localStorage.getItem('notifEnabled') !== 'false';
    const isRead = localStorage.getItem('notifRead') === 'true';
    if (!isNotifOn || isRead) {
      badge.style.display = 'none';
    } else {
      badge.style.display = 'block';
    }
  }

  // タイムライン読み込み
  if(dateIn) {
    const loadTimeline = () => {
      const day = new Date(dateIn.value).getDay();
      renderTimeline(JSON.parse(localStorage.getItem(`schedule_${day}`) || "[]"), day);
    };
    dateIn.onchange = loadTimeline;
    loadTimeline();
  }

  // 毎秒更新
  setInterval(() => {
    const clock = document.getElementById('digital-clock');
    if(clock) clock.innerText = new Date().toLocaleTimeString('ja-JP');
    updateAllHighlights();
  }, 1000);

  // --- 課題管理モーダル ---
  const taskBtn = document.getElementById('task-btn');
  if(taskBtn) {
    taskBtn.onclick = () => {
      document.getElementById('task-memo').value = localStorage.getItem('taskMemo') || "";
      document.getElementById('task-modal').classList.remove('hidden');
    };
  }
  
  const saveTaskBtn = document.getElementById('save-task');
  if (saveTaskBtn) {
    saveTaskBtn.onclick = () => {
      localStorage.setItem('taskMemo', document.getElementById('task-memo').value);
      document.getElementById('task-modal').classList.add('hidden');
      alert("保存しました");
    };
  }

  const cancelTaskBtn = document.getElementById('cancel-task');
  if (cancelTaskBtn) {
    cancelTaskBtn.onclick = () => {
      document.getElementById('task-modal').classList.add('hidden');
    };
  }

  // --- お知らせモーダル ---
  const notifBtn = document.getElementById('notif-btn');
  if (notifBtn) {
    notifBtn.onclick = () => {
      document.getElementById('notif-modal').classList.remove('hidden');
      const badge = document.getElementById('notification-badge');
      if(badge) {
        badge.style.display = 'none';
        localStorage.setItem('notifRead', 'true');
      }
    };
  }
  const closeNotifBtn = document.getElementById('close-notif');
  if (closeNotifBtn) {
    closeNotifBtn.onclick = () => document.getElementById('notif-modal').classList.add('hidden');
  }

  // --- 時間割変更（編集）ボタン ---
  const editTodayBtn = document.getElementById('edit-today-btn');
  const editTodayModal = document.getElementById('edit-today-modal');

  if(editTodayBtn) {
    editTodayBtn.onclick = () => {
      const day = new Date(dateIn.value).getDay();
      const data = JSON.parse(localStorage.getItem(`schedule_${day}`) || "[]");
      const table = document.getElementById('today-edit-table');
      
     // スケジュール編集のデフォルトで入っている時間

      table.innerHTML = '';
      const DEFAULTS = [{s:"09:00",e:"10:30"},{s:"10:40",e:"12:10"},{s:"13:00",e:"14:30"},{s:"14:40",e:"16:10"},{s:"16:20",e:"17:50"},{s:":",e:":"}];

      for(let i=0; i<6; i++) {
        // キー名を統一: title, room, time, end
        const item = data[i] || {time:DEFAULTS[i].s, end:DEFAULTS[i].e, title:"", room:""};
        table.innerHTML += `
          <tr style="border-bottom: 2px solid var(--bg-color); display: block; padding: 10px 0;">
            <td>
              <div style="font-weight:bold; color:var(--accent-color); font-size:0.8rem;">${i+1}限</div>
              <input type="text" value="${item.title}" placeholder="講義名" class="edit-title" style="width:100%; padding:8px; margin:5px 0; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;">
              <input type="text" value="${item.room}" placeholder="教室" class="edit-room" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;">
              <div style="display:flex; gap:10px; margin-top:5px;">
                <input type="time" value="${item.time}" class="edit-start" style="flex:1; padding:5px;">
                <input type="time" value="${item.end}" class="edit-end" style="flex:1; padding:5px;">
              </div>
            </td>
          </tr>`;
      }
      editTodayModal.classList.remove('hidden');
    };
  }

  // --- 時間割編集モーダル内のコピー・ペースト機能 ---
  const getRowsData = () => {
    const rows = document.querySelectorAll('#today-edit-table tr');
    return Array.from(rows).map(row => {
      return { 
        title: row.querySelector('.edit-title').value, 
        room: row.querySelector('.edit-room').value, 
        time: row.querySelector('.edit-start').value, 
        end: row.querySelector('.edit-end').value 
      };
    });
  };
  
  const setRowsData = (dataList) => {
    const rows = document.querySelectorAll('#today-edit-table tr');
    dataList.forEach((data, i) => {
      if(!rows[i]) return;
      rows[i].querySelector('.edit-title').value = data.title;
      rows[i].querySelector('.edit-room').value = data.room;
      rows[i].querySelector('.edit-start').value = data.time;
      rows[i].querySelector('.edit-end').value = data.end;
    });
  };

  const copyBtn = document.getElementById('modal-copy-day');
  if(copyBtn) {
    copyBtn.onclick = () => {
      clipboardData = getRowsData();
      alert('スケジュールをコピーしました');
    };
  }

  const pasteBtn = document.getElementById('modal-paste-day');
  if(pasteBtn) {
    pasteBtn.onclick = () => {
      if(!clipboardData) return alert('先にコピーしてください');
      setRowsData(clipboardData);
      alert('スケジュールを貼り付けました');
    };
  }
  
  const clearBtn = document.getElementById('modal-clear-day');
  if(clearBtn) {
    clearBtn.onclick = () => {
      if(!confirm('すべての入力を消去しますか？')) return;
      const rows = document.querySelectorAll('#today-edit-table tr');
      rows.forEach(row => {
        row.querySelector('.edit-title').value = '';
        row.querySelector('.edit-room').value = '';
      });
    };
  }

  // 時間割変更の保存ボタン
  const saveTodayBtn = document.getElementById('save-today-edit');
  if(saveTodayBtn) {
    saveTodayBtn.onclick = () => {
      const day = new Date(dateIn.value).getDay();
      const newData = getRowsData(); // 共通関数を使用
      localStorage.setItem(`schedule_${day}`, JSON.stringify(newData));

      if (localStorage.getItem('autoReturnEnabled') === 'true') {
        const today = new Date().toLocaleDateString('sv-SE');
        localStorage.setItem('tempDate', today);
      } else {
        localStorage.setItem('tempDate', dateIn.value);
      }

      alert("時間割を更新しました");
      editTodayModal.classList.add('hidden');
      location.reload();
    };
  }

  const closeTodayBtn = document.getElementById('close-today-edit');
  if(closeTodayBtn) {
    closeTodayBtn.onclick = () => editTodayModal.classList.add('hidden');
  }

  // 余白クリックで閉じる
  document.querySelectorAll('.modal').forEach(modal => {
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    };
  });
});