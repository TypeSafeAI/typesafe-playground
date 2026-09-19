(() => {
  "use strict";
  const C = window.ConversationLab;
  const $ = id => document.getElementById(id);
  const labels = {context:"A · Full context", latest:"B · Latest message only"};
  const samples = {
    followup:{transcript:"Ada: I cannot sign in to the dashboard.\nSam: Are you using the email link or a password?\nAda: The email link. It says it has expired.", expected:"question"},
    chatter:{transcript:"Ada: Where do I change my notification settings?\nSam: Open Settings, then Notifications.\nAda: Found it, thanks!", expected:"chatter"}
  };
  let latest = null, busy = false, rows = [], runController = null;
  const threshold = () => Number($("lab-threshold").value) / 100;
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function predicted(response) {
    const answer = response?.answers?.frame;
    return answer?.type === "choice" && Object.hasOwn(C.frames, answer.choice) ? answer.choice : null;
  }
  function loadSample() {
    const sample = samples[$("lab-sample").value];
    $("lab-transcript").value = sample.transcript;
    $("lab-format").value = "auto";
    $("lab-expected").value = sample.expected;
    renderTranscript(); markEdited();
  }
  function markEdited() {
    if (latest) $("lab-status").textContent = "Input changed. Decisions below describe the previous run; run again to evaluate edits.";
  }
  function updateMode() {
    const mode = $("lab-mode").value;
    $("lab-expected").disabled = mode === "contest";
    $("lab-preview-note").textContent = (mode === "contest" ? "Each speaker's latest block is a candidate." : "The last speaker block is the target.") + " Consecutive lines without a new header stay together. Check the preview; change the format or edit the paste if needed.";
    $("lab-run").textContent = mode === "contest" ? "Pick a recipient" : mode === "compare" ? "Run comparison" : "Run conversation";
    $("lab-request-note").textContent = mode === "contest" ? "One request per speaker · 3 at a time." : mode === "compare" ? "2 requests · full context vs. final message." : "1 request · final message with context.";
    if (mode === "contest") {
      try {
        const count = Math.max(1,new Set(C.parseTranscript($("lab-transcript").value,$("lab-format").value).messages.map(message => message.speaker).filter(Boolean)).size);
        $("lab-run").textContent = "Pick a recipient · " + count + " request" + (count === 1 ? "" : "s");
      } catch { /* The transcript preview shows the parse error. */ }
    }
  }
  function renderTranscript() {
    $("lab-messages").replaceChildren(); $("lab-parse-error").textContent = "";
    updateMode();
    try {
      const parsed = C.parseTranscript($("lab-transcript").value,$("lab-format").value);
      const speakers = new Set(parsed.messages.map(message => message.speaker).filter(Boolean));
      const names = {discord:"Discord",labeled:"Name: message",plain:"Plain text"};
      $("lab-parse-summary").textContent = names[parsed.format] + " · " + parsed.messages.length + " message block(s) · " + speakers.size + " speaker(s)";
      if (parsed.ignoredStageNotices) $("lab-parse-summary").textContent += " · " + parsed.ignoredStageNotices + " Discord stage notice(s) ignored";
      const lastBySpeaker = new Map();
      parsed.messages.forEach((message,index) => { if (message.speaker !== null || speakers.size === 0) lastBySpeaker.set(message.speaker,index); });
      for (const [index,message] of parsed.messages.entries()) {
        const item = node("li",undefined,"parsed-message");
        const heading = node("div",undefined,"parsed-message-heading");
        heading.append(node("strong",message.speaker || "Unknown speaker"));
        if (message.timestamp) heading.append(node("span",message.timestamp,"muted"));
        if ($("lab-mode").value === "contest" ? lastBySpeaker.get(message.speaker) === index : index === parsed.messages.length-1) { item.classList.add("is-target"); heading.append(node("span",$("lab-mode").value === "contest" ? "Candidate" : "Target","target-badge")); }
        item.append(heading,node("p",message.content)); $("lab-messages").append(item);
      }
    } catch (error) {
      $("lab-parse-summary").textContent = "Check the pasted conversation";
      $("lab-parse-error").textContent = error.message;
      $("lab-preview").open = true;
    }
  }
  function render() {
    $("lab-threshold-value").textContent = Math.round(threshold()*100) + "%";
    $("lab-results").replaceChildren();
    if (!latest) {
      const empty = node("div",undefined,"lab-empty");
      empty.append(node("strong",busy ? "Reading the conversation…" : "Your next decision starts here"),node("p",busy ? "Evaluating the target against your bot policy." : "Paste a chat, check the target, then run. The response decision and conversation frame appear here."));
      $("lab-results").append(empty); return;
    }
    if (latest.mode === "contest") {
      const picked = C.pickWinners(latest.results,threshold());
      const banner = node("section",undefined,"winner-banner " + (picked.status === "winner" ? "has-winner" : ""));
      banner.append(node("span",picked.status === "winner" ? "✦ REPLY PICK" : picked.status === "tie" ? "SHARED TOP SCORE" : "REPLY PICK","winner-eyebrow"));
      banner.append(node("h3",picked.status === "winner" ? "Answer " + picked.winners[0].speaker : picked.status === "tie" ? picked.winners.map(result => result.speaker).join(" & ") : picked.status === "none" ? "Let the conversation flow" : "No winner yet","winner-title"));
      banner.append(node("p",picked.status === "winner" ? "Highest reply probability meeting your threshold. This is the model's pick, not a correctness score." : picked.status === "tie" ? "A tie! These speakers share the highest eligible score." : picked.status === "none" ? "Nobody meets the response threshold. No reply recommended." : "At least one score is missing or invalid. Run again before choosing a recipient.","winner-description"));
      for (const result of picked.winners) {
        const quote = node("blockquote",result.payload.state.messages.at(-1).content,"winner-message"); banner.append(quote);
      }
      $("lab-results").append(banner);
    }
    const target = latest.results[0].payload.state.messages.at(-1);
    const targetBox = node("details",undefined,"decision-target");
    targetBox.append(node("summary","Evaluated message · " + (target.speaker || "Unknown speaker")),node("p",target.content));
    if (latest.mode !== "contest") $("lab-results").append(targetBox);
    const cards = node("div",undefined,"decision-cards");
    const ranked = latest.mode === "contest" ? [...latest.results].sort((a,b) => (b.response?.answers?.should_respond?.noul ?? -1) - (a.response?.answers?.should_respond?.noul ?? -1)) : latest.results;
    for (const result of ranked) {
      const answer = result.response?.answers?.should_respond;
      const decision = C.gate(answer,threshold());
      const card = node("article",undefined,"decision-card " + (decision === "Respond" ? "decision-respond" : decision === "Skip" ? "decision-skip" : "decision-unavailable"));
      card.append(node("h3",latest.mode === "contest" ? "#" + (ranked.filter(other => (other.response?.answers?.should_respond?.noul ?? -1) > (answer?.noul ?? -1)).length+1) + " · " + result.speaker : labels[result.variant],"decision-variant"));
      const hero = node("div",undefined,"decision-hero");
      hero.append(node("span",decision === "Respond" ? "↗" : decision === "Skip" ? "−" : "?","decision-icon"),node("strong",decision,"decision-title"));
      hero.firstChild.setAttribute("aria-hidden","true"); card.append(hero);
      card.append(node("p",decision === "Respond" ? "The gate recommends a reply." : decision === "Skip" ? "The gate recommends staying quiet." : "No valid response probability returned.","decision-description"));
      if (decision !== "Unavailable") {
        const probability = node("div",undefined,"decision-probability");
        probability.append(node("span","Reply probability"),node("strong",(answer.noul*100).toFixed(1) + "%")); card.append(probability);
        const track = node("div",undefined,"decision-track");
        track.setAttribute("aria-hidden","true");
        const fill = node("span"); fill.style.width = (answer.noul*100) + "%";
        const marker = node("i"); marker.style.left = (threshold()*100) + "%";
        track.append(fill,marker); card.append(track);
        card.append(node("p",Math.round(threshold()*100) + "% threshold · " + (answer.noul >= threshold() ? "met" : "not met"),"decision-threshold"));
      }
      if (result.error) card.append(node("p",result.error,"form-error"));
      const frame = predicted(result.response);
      const frameRow = node("div",undefined,"decision-frame");
      frameRow.append(node("span","Conversation frame"),node("strong",frame ? frame[0].toUpperCase()+frame.slice(1) : "Unavailable","frame-badge")); card.append(frameRow);
      if (latest.expected) card.append(node("p","Expected: " + latest.expected + (frame ? (frame === latest.expected ? " · Match" : " · Mismatch") : " · Not scored"),"decision-expected"));
      if (latest.mode === "contest") {
        const message = node("details",undefined,"candidate-message"); message.append(node("summary","View message"),node("p",result.payload.state.messages.at(-1).content)); card.append(message);
      }
      card.append(node("p",result.response?.model || "Model not reported","decision-model")); cards.append(card);
    }
    $("lab-results").append(cards);
    if (latest.mode === "compare" && latest.results.length === 2) {
      const [a,b] = latest.results.map(result => result.response?.answers?.should_respond);
      if (C.gate(a,threshold()) !== "Unavailable" && C.gate(b,threshold()) !== "Unavailable") {
        const delta = (b.noul-a.noul)*100;
        const summary = node("div",undefined,"context-summary");
        summary.append(node("strong",C.gate(a,threshold()) === C.gate(b,threshold()) ? "Same response decision" : "Context changes the response decision"),node("p","Removing earlier messages shifts reply probability by " + (delta > 0 ? "+" : "") + delta.toFixed(1) + " percentage points."));
        $("lab-results").append(summary);
      }
    }
  }
  function renderMetrics() {
    $("lab-metrics").replaceChildren();
    for (const variant of ["context","latest"]) {
      const metrics = C.summarize(rows,variant);
      $("lab-metrics").append(node("p", labels[variant] + ": " + (metrics.total ? metrics.correct + "/" + metrics.total + " correct (" + (metrics.correct/metrics.total*100).toFixed(1) + "%)" : "No labeled predictions yet.")));
      if (!metrics.total) continue;
      const table = node("table"), head = node("thead"), tr = node("tr");
      tr.append(node("th", "Expected ↓ / Predicted →"));
      for (const frame of Object.keys(C.frames)) { const th = node("th", frame); th.scope = "col"; tr.append(th); }
      head.append(tr); table.append(head);
      const body = node("tbody");
      for (const frame of Object.keys(C.frames)) {
        const row = node("tr"), th = node("th",frame); th.scope = "row"; row.append(th);
        for (const count of Object.values(metrics.matrix[frame])) row.append(node("td",String(count)));
        body.append(row);
      }
      table.append(body);
      const scroll = node("div",undefined,"lab-table-scroll"); scroll.tabIndex = 0; scroll.setAttribute("role","region"); scroll.setAttribute("aria-label",labels[variant] + " confusion matrix"); scroll.append(table); $("lab-metrics").append(scroll);
    }
  }
  async function request(payload, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort",abort,{once:true});
    if (signal.aborted) abort();
    const timeout = setTimeout(abort,55000);
    try {
      const response = await fetch("/api/run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:controller.signal});
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Request failed (HTTP " + response.status + ").");
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Unexpected response from TypeSafe.");
      return body;
    } catch (error) {
      if (controller.signal.aborted) throw new Error(signal.aborted ? "Cancelled. The upstream request may still complete." : "Request timed out after 55 seconds.");
      throw error;
    } finally { clearTimeout(timeout); signal.removeEventListener("abort",abort); }
  }
  function setLabView(view) {
    document.querySelector(".lab-grid").dataset.labView=view;
    document.querySelectorAll("button[data-lab-view]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.labView===view)));
  }
  document.querySelectorAll("button[data-lab-view]").forEach(button=>button.addEventListener("click",()=>setLabView(button.dataset.labView)));
  async function run(event) {
    event.preventDefault();
    if (busy) return;
    $("lab-error").textContent = "";
    let requests;
    const mode = $("lab-mode").value;
    const expected = mode === "contest" ? "" : $("lab-expected").value;
    try {
      const input = {transcript:$("lab-transcript").value,policy:$("lab-policy").value,model:$("lab-model").value,format:$("lab-format").value};
      requests = mode === "contest" ? C.buildCandidates(input) : [{variant:"context",payload:C.buildRequest(input,true)}];
      if (mode === "compare") requests.push({variant:"latest",payload:C.buildRequest(input,false)});
    } catch (error) { $("lab-error").textContent = error.message; if (!$("lab-policy").value.trim()) $("lab-settings").open = true; if (window.matchMedia("(max-width:800px)").matches) setLabView("output"); return; }
    if (window.matchMedia("(max-width:800px)").matches) setLabView("output");
    busy = true; $("lab-results").setAttribute("aria-busy","true"); $("lab-progress").hidden = false; $("lab-progress").value = 0; $("lab-progress").max = requests.length; $("lab-fields").disabled = true; $("lab-export").disabled = true;
    latest = null; render();
    $("lab-status").textContent = "Running " + requests.length + " request(s)…";
    const controller = new AbortController();
    runController = controller; $("lab-cancel").hidden = false;
    const start = performance.now();
    try {
      const outcomes = await C.runBatches(requests,async item => ({...item,response:await request(item.payload,controller.signal)}),{
        signal:controller.signal,
        onProgress:progress => { $("lab-progress").value = progress.completed; $("lab-status").textContent = "Processed " + progress.completed + "/" + progress.total + " · batch " + progress.batch + "/" + progress.batches; }
      });
      const failures = outcomes.filter(outcome => outcome.status === "rejected").length;
      latest = {mode,timestamp:new Date().toISOString(),durationMs:Math.round(performance.now()-start),expected,results:outcomes.map((outcome,index) => outcome.status === "fulfilled" ? outcome.value : {...requests[index],error:outcome.reason.message,response:null})};
      if (!failures) rows.push(...latest.results.map(result => ({expected,variant:result.variant,predicted:predicted(result.response)})));
      render(); renderMetrics(); $("lab-export").disabled = false;
      $("lab-status").textContent = (controller.signal.aborted ? "Cancelled" : failures ? "Incomplete" : "Complete") + " · " + (requests.length-failures) + "/" + requests.length + " succeeded · " + latest.durationMs + " ms.";
      if (failures) $("lab-error").textContent = failures + " candidate(s) failed or were cancelled. Successful results are retained; no winner is selected for an incomplete contest. No evaluation rows added.";
    } catch (error) {
      $("lab-error").textContent = error.name === "AbortError" ? "Timed out. Try again." : error.message;
      $("lab-status").textContent = "Run failed. No evaluation rows added. A request may have completed upstream; retrying sends new requests.";
    } finally { busy = false; $("lab-results").setAttribute("aria-busy","false"); $("lab-progress").hidden = true; runController = null; $("lab-cancel").hidden = true; $("lab-fields").disabled = false; if (!latest) render(); }
  }
  for (const [frame,definition] of Object.entries(C.frames)) {
    const option = node("option",frame); option.value = frame; $("lab-expected").append(option);
    $("lab-definitions").append(node("dt",frame),node("dd",definition));
  }
  $("lab-sample").addEventListener("change",loadSample);
  $("lab-transcript").addEventListener("input",() => { $("lab-expected").value = ""; renderTranscript(); });
  $("lab-format").addEventListener("change",() => { $("lab-expected").value = ""; renderTranscript(); markEdited(); });
  $("lab-form").addEventListener("input",markEdited);
  $("lab-form").addEventListener("submit",run);
  $("lab-cancel").addEventListener("click",() => { runController?.abort(); $("lab-status").textContent = "Cancelling…"; });
  $("lab-threshold").addEventListener("input",render);
  $("lab-mode").addEventListener("change",() => { renderTranscript(); markEdited(); });
  $("lab-clear").addEventListener("click",() => { rows = []; renderMetrics(); });
  $("lab-export").addEventListener("click",() => {
    if (!latest) return;
    const data = {...latest,threshold:threshold(),...(latest.mode === "contest" ? {selection:C.pickWinners(latest.results,threshold()).status,winners:C.pickWinners(latest.results,threshold()).winners.map(result => result.speaker)} : {}),decisions:latest.results.map(result => ({variant:result.variant,speaker:result.speaker,decision:C.gate(result.response?.answers?.should_respond,threshold())}))};
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
    const anchor = node("a"); anchor.href = url; anchor.download = "conversation-run.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  });
  loadSample(); render(); renderMetrics();
  fetch("/api/health").then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(health => {
    $("lab-health").textContent = health.configured ? "API ready" : "API key needed";
    $("lab-health").classList.add(health.configured ? "status-ready" : "status-offline");
  }).catch(() => { $("lab-health").textContent = "Server offline"; $("lab-health").classList.add("status-offline"); });
})();
