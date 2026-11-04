(() => {
  const API = "https://api.enem.dev/v1";
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const state = {
    exams: [],
    exam: null,
    language: "",
    discipline: "",
    questions: [],
    total: 0,
    page: 1,
    perPage: 10,
    loading: false,
    token: 0,
    answers: {},
    cache: new Map(),
  };

  let lastCall = 0;
  let chain = Promise.resolve();
  function throttled(url) {
    const run = async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const wait = Math.max(0, lastCall + 1100 - Date.now());
        if (wait) await sleep(wait);
        lastCall = Date.now();
        const res = await fetch(url);
        if (res.status === 429) {
          const retry = Number(res.headers.get("Retry-After"));
          await sleep(Math.min(Math.max(retry || 2000, 1500), 10000));
          continue;
        }
        return res;
      }
      throw new Error(
        "Muitas requisições. Aguarde alguns segundos e tente de novo.",
      );
    };
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  }

  async function getJson(path) {
    const res = await throttled(API + path);
    let body = null;
    try {
      body = await res.json();
    } catch (_) {}
    if (!res.ok) {
      const err = new Error(body?.error?.message || "Erro " + res.status);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  /* ---------- texto: escape + markdown mínimo ---------- */
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  function md(text) {
    if (!text) return "";
    let h = esc(text);
    h = h.replace(
      /!\[([^\]]*)\]\((https?:[^)\s]+)\)/g,
      '<img src="$2" alt="$1" loading="lazy">',
    );
    h = h.replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    );
    h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    return h
      .split(/\n{2,}/)
      .map((p) => "<p>" + p.replace(/\n/g, "<br>") + "</p>")
      .join("");
  }

  /* ---------- respostas salvas no navegador ---------- */
  const storeKey = () => "enem-front:" + state.exam.year;
  function loadAnswers() {
    try {
      state.answers = JSON.parse(localStorage.getItem(storeKey()) || "{}");
    } catch (_) {
      state.answers = {};
    }
  }
  function saveAnswers() {
    try {
      localStorage.setItem(storeKey(), JSON.stringify(state.answers));
    } catch (_) {}
  }
  const qKey = (q) => q.index + "-" + (q.language || "");

  /* ---------- carregamento ---------- */
  async function loadExams() {
    try {
      const exams = await getJson("/exams");
      state.exams = exams.sort((a, b) => b.year - a.year);
      $("#year").innerHTML = state.exams
        .map((e) => `<option value="${e.year}">${esc(e.title)}</option>`)
        .join("");
      selectExam(state.exams[0].year);
    } catch (e) {
      showError(e.message, loadExams);
    }
  }

  function selectExam(year) {
    state.exam = state.exams.find((e) => e.year === Number(year));
    state.discipline = "";
    state.language = "";
    state.page = 1;
    $("#discipline").innerHTML =
      '<option value="">Todas as áreas</option>' +
      state.exam.disciplines
        .map((d) => `<option value="${esc(d.value)}">${esc(d.label)}</option>`)
        .join("");
    $("#language").innerHTML =
      '<option value="">Todos</option>' +
      state.exam.languages
        .map((l) => `<option value="${esc(l.value)}">${esc(l.label)}</option>`)
        .join("");
    loadAnswers();
    loadQuestions();
  }

  async function loadQuestions() {
    const token = ++state.token;
    const year = state.exam.year;
    const cacheKey = year + "|" + state.language;
    $("#banner").innerHTML = "";

    if (state.cache.has(cacheKey)) {
      const c = state.cache.get(cacheKey);
      state.questions = c.questions;
      state.total = c.total;
      state.loading = false;
      render();
      return;
    }

    state.questions = [];
    state.total = 0;
    state.loading = true;
    render();

    let limit = 50,
      offset = 0;
    try {
      while (true) {
        const qs =
          `?limit=${limit}&offset=${offset}` +
          (state.language
            ? "&language=" + encodeURIComponent(state.language)
            : "");
        let data;
        try {
          data = await getJson(`/exams/${year}/questions${qs}`);
        } catch (e) {
          if ((e.status === 400 || e.status === 422) && limit > 10) {
            limit = limit > 20 ? 20 : 10;
            continue;
          }
          throw e;
        }
        if (token !== state.token) return;
        state.questions.push(...data.questions);
        state.total = data.metadata.total;
        offset += data.questions.length || limit;
        render();
        if (!data.metadata.hasMore || !data.questions.length) break;
      }
      state.loading = false;
      state.cache.set(cacheKey, {
        questions: state.questions,
        total: state.total,
      });
      render();
    } catch (e) {
      if (token !== state.token) return;
      state.loading = false;
      showError(e.message, loadQuestions);
      render();
    }
  }

  function showError(msg, retry) {
    $("#banner").innerHTML =
      `<div class="banner"><span>Não foi possível carregar: ${esc(msg)}</span><button class="btn light" id="retry" type="button">Tentar de novo</button></div>`;
    $("#retry").addEventListener("click", () => {
      $("#banner").innerHTML = "";
      retry();
    });
  }

  /* ---------- renderização ---------- */
  const disciplineLabel = (v) =>
    state.exam.disciplines.find((d) => d.value === v)?.label || v || "";
  const languageLabel = (v) =>
    state.exam.languages.find((l) => l.value === v)?.label || v || "";

  function filtered() {
    return state.questions.filter(
      (q) =>
        (!state.discipline || q.discipline === state.discipline) &&
        (!state.language || !q.language || q.language === state.language),
    );
  }

  function questionHtml(q) {
    const key = qKey(q);
    const ans = state.answers[key];
    const answered = ans && ans !== "*";
    const revealed = !!ans;
    const ctx = q.context || "";
    const extraFiles = (q.files || []).filter((f) => !ctx.includes(f));
    const alts = q.alternatives
      .map((a) => {
        let cls = "alt";
        if (revealed && a.letter === q.correctAlternative) cls += " is-correct";
        else if (answered && a.letter === ans) cls += " is-wrong";
        const body =
          (a.text ? md(a.text) : "") +
          (a.file
            ? `<img src="${esc(a.file)}" alt="Alternativa ${a.letter}" loading="lazy">`
            : "");
        return `<li><button type="button" class="${cls}" data-key="${esc(key)}" data-letter="${a.letter}" ${revealed ? "disabled" : ""}>
        <span class="bubble">${a.letter}</span><span class="atext">${body}</span></button></li>`;
      })
      .join("");

    let verdict =
      '<span class="verdict neutral">Escolha uma alternativa</span>';
    if (answered) {
      verdict =
        ans === q.correctAlternative
          ? '<span class="verdict ok">Correto</span>'
          : `<span class="verdict bad">Incorreto. Gabarito: ${q.correctAlternative}</span>`;
    } else if (revealed) {
      verdict = `<span class="verdict neutral">Gabarito: ${q.correctAlternative}</span>`;
    }
    const action = revealed
      ? `<button type="button" class="btn light" data-redo="${esc(key)}">Refazer</button>`
      : `<button type="button" class="btn light" data-reveal="${esc(key)}">Ver gabarito</button>`;

    return `<article class="q" id="q-${esc(key)}">
      <header><span class="num">Questão ${q.index}</span>
        ${q.discipline ? `<span class="tag">${esc(disciplineLabel(q.discipline))}</span>` : ""}
        ${q.language ? `<span class="tag">${esc(languageLabel(q.language))}</span>` : ""}</header>
      ${ctx ? `<div class="ctx">${md(ctx)}</div>` : ""}
      ${extraFiles.length ? `<div class="files">${extraFiles.map((f) => `<img src="${esc(f)}" alt="Imagem da questão ${q.index}" loading="lazy">`).join("")}</div>` : ""}
      ${q.alternativesIntroduction ? `<div class="intro">${md(q.alternativesIntroduction)}</div>` : ""}
      <ol class="alts">${alts}</ol>
      <footer>${verdict}${action}</footer>
    </article>`;
  }

  function render() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / state.perPage));
    if (state.page > pages) state.page = pages;
    const slice = list.slice(
      (state.page - 1) * state.perPage,
      state.page * state.perPage,
    );

    $("#status").textContent = state.loading
      ? `Carregando questões… ${state.questions.length}${state.total ? " de " + state.total : ""}`
      : `${list.length} questões em ${state.exam?.title || ""}`;

    $("#list").innerHTML = slice.length
      ? slice.map(questionHtml).join("")
      : `<div class="empty">${state.loading ? "Buscando as primeiras questões…" : "Nenhuma questão para esse filtro."}</div>`;

    $("#pager").innerHTML =
      pages > 1
        ? `
      <button class="btn light" type="button" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""}>Anterior</button>
      <span>Página ${state.page} de ${pages}</span>
      <button class="btn light" type="button" data-page="${state.page + 1}" ${state.page === pages ? "disabled" : ""}>Próxima</button>`
        : "";

    renderSheet(list);
  }

  function renderSheet(list) {
    let done = 0,
      hits = 0;
    $("#grid").innerHTML = list
      .map((q, i) => {
        const ans = state.answers[qKey(q)];
        let cls = "cell";
        if (ans && ans !== "*") {
          done++;
          if (ans === q.correctAlternative) {
            cls += " ok";
            hits++;
          } else cls += " bad";
        } else if (ans === "*") cls += " seen";
        return `<button type="button" class="${cls}" data-jump="${i}" title="Questão ${q.index}">${q.index}</button>`;
      })
      .join("");
    $("#score").textContent = `${done} respondidas · ${hits} acertos`;
  }

  /* ---------- eventos ---------- */
  $("#year").addEventListener("change", (e) => selectExam(e.target.value));
  $("#discipline").addEventListener("change", (e) => {
    state.discipline = e.target.value;
    state.page = 1;
    render();
  });
  $("#language").addEventListener("change", (e) => {
    state.language = e.target.value;
    state.page = 1;
    loadQuestions();
  });

  $("#list").addEventListener("click", (e) => {
    const alt = e.target.closest(".alt");
    const reveal = e.target.closest("[data-reveal]");
    const redo = e.target.closest("[data-redo]");
    if (alt) state.answers[alt.dataset.key] = alt.dataset.letter;
    else if (reveal) state.answers[reveal.dataset.reveal] = "*";
    else if (redo) delete state.answers[redo.dataset.redo];
    else return;
    saveAnswers();
    const y = window.scrollY;
    render();
    window.scrollTo({ top: y });
  });

  $("#pager").addEventListener("click", (e) => {
    const b = e.target.closest("[data-page]");
    if (!b || b.disabled) return;
    state.page = Number(b.dataset.page);
    render();
    $("#status").scrollIntoView({ block: "start" });
  });

  $("#grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-jump]");
    if (!b) return;
    const i = Number(b.dataset.jump);
    state.page = Math.floor(i / state.perPage) + 1;
    render();
    const q = filtered()[i];
    document.getElementById("q-" + qKey(q))?.scrollIntoView({ block: "start" });
  });

  $("#reset").addEventListener("click", () => {
    state.answers = {};
    saveAnswers();
    render();
  });

  loadExams();
})();
