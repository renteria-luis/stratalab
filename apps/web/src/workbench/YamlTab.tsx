import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { yaml as yamlLanguage } from '@codemirror/lang-yaml';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/useT';
import { topologyStore, useTopology, useTopologyStore } from '../state/topologyStore';
import { uiStore, useUi, type CanvasLayout } from '../state/uiStore';
import { YAML_LIMIT_KIB, parseTopologyYaml, topologyToYaml, type YamlProblem } from './yaml';

const EMPTY_LAYOUT: CanvasLayout = {};

type Notice =
  | { readonly kind: 'applied'; readonly canonicalized: boolean }
  | { readonly kind: 'problems'; readonly problems: readonly YamlProblem[] }
  | null;

/**
 * The YAML editor (CodeMirror 6). It edits a draft: Apply parses it safely, checks it with
 * Zod and commits it only when valid; otherwise it shows the problems inline and keeps the
 * last valid topology (AGENTS.md, rule 6). The `layout` section goes to the UI store.
 */
export function YamlTab() {
  const translator = useT();
  const { t, locale } = translator;
  const topology = useTopology();
  const workspaceId = useTopologyStore((state) => state.activeWorkspaceId);
  const layout = useUi((state) => state.canvasLayouts[workspaceId]) ?? EMPTY_LAYOUT;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const dirty = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const committed = topologyToYaml(topology, layout);

  useEffect(() => {
    if (host.current === null) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: committed,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          yamlLanguage(),
          syntaxHighlighting(defaultHighlightStyle),
          lintGutter(),
          EditorView.contentAttributes.of({ 'aria-label': t('yaml.editorLabel') }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) dirty.current = true;
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The editor is created once; later topology changes replace its text below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Console edits update the editor while the learner has no unapplied draft.
  useEffect(() => {
    const editor = view.current;
    if (editor === null || dirty.current) return;
    if (editor.state.doc.toString() === committed) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: committed } });
    dirty.current = false;
  }, [committed]);

  const replaceText = (text: string) => {
    const editor = view.current;
    if (editor === null) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } });
  };

  const apply = () => {
    const editor = view.current;
    if (editor === null) return;
    const parsed = parseTopologyYaml(editor.state.doc.toString());
    if (!parsed.ok) {
      const length = editor.state.doc.length;
      const diagnostics: Diagnostic[] = parsed.problems.map((problem) => ({
        from: Math.min(problem.from ?? 0, length),
        to: Math.min(problem.to ?? problem.from ?? 0, length),
        severity: 'error',
        message: t(problem.key, problem.params),
      }));
      editor.dispatch(setDiagnostics(editor.state, diagnostics));
      setNotice({ kind: 'problems', problems: parsed.problems });
      return;
    }
    editor.dispatch(setDiagnostics(editor.state, []));
    topologyStore.getState().replaceActiveTopology(parsed.topology);
    if (parsed.layout !== null) uiStore.getState().setCanvasLayout(workspaceId, parsed.layout);
    dirty.current = false;
    setNotice({ kind: 'applied', canonicalized: parsed.canonicalized });
  };

  const exportYaml = () => {
    const blob = new Blob([committed], { type: 'application/yaml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${workspaceId}-topology.yaml`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SpaceBetween size="s">
      <SpaceBetween direction="horizontal" size="xs">
        <Button variant="primary" onClick={apply}>
          {t('yaml.apply')}
        </Button>
        <Button
          onClick={() => {
            dirty.current = false;
            replaceText(committed);
            dirty.current = false;
            view.current?.dispatch(setDiagnostics(view.current.state, []));
            setNotice(null);
          }}
        >
          {t('yaml.revert')}
        </Button>
        <Button iconName="download" onClick={exportYaml}>
          {t('yaml.export')}
        </Button>
        <Button
          iconName="upload"
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          {t('yaml.import')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".yaml,.yml,application/yaml,text/yaml"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file === undefined) return;
            if (file.size > YAML_LIMIT_KIB * 1024) {
              setNotice({
                kind: 'problems',
                problems: [{ key: 'yaml.tooLarge', params: { limit: YAML_LIMIT_KIB } }],
              });
              return;
            }
            void file.text().then((text) => {
              replaceText(text);
              dirty.current = true;
              setNotice(null);
            });
          }}
        />
      </SpaceBetween>
      {notice !== null && (
        <div lang={locale}>
          {notice.kind === 'applied' ? (
            <Alert type="success" header={t('yaml.applied')}>
              {notice.canonicalized ? t('yaml.canonical') : undefined}
            </Alert>
          ) : (
            <Alert type="error" header={t('yaml.invalid')}>
              <ul className="sim-issue-list">
                {notice.problems.slice(0, 20).map((problem, index) => (
                  <li key={index}>{t(problem.key, problem.params)}</li>
                ))}
              </ul>
            </Alert>
          )}
        </div>
      )}
      <div ref={host} className="sim-yaml-editor" />
    </SpaceBetween>
  );
}
