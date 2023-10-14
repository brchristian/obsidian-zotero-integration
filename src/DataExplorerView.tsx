import { ItemView, Menu, TFile, WorkspaceLeaf, moment } from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom';
import { JSONTree, LabelRenderer, ValueRenderer } from 'react-json-tree';

import { dataExplorerPrompt, renderTemplates } from './bbt/export';
import { PersistExtension } from './bbt/template.env';
import { sanitizeObsidianPath } from './bbt/template.helpers';
import ZoteroConnector from './main';
import { ExportFormat, ExportToMarkdownParams } from './types';

export const viewType = 'zdc-debug';

const tomorrowLight = {
  scheme: 'Tomorrow',
  author: 'Chris Kempson (http://chriskempson.com)',
  base00: '#ffffff',
  base01: '#e0e0e0',
  base02: '#d6d6d6',
  base03: '#8e908c',
  base04: '#969896',
  base05: '#4d4d4c',
  base06: '#282a2e',
  base07: '#1d1f21',
  base08: '#c82829',
  base09: '#f5871f',
  base0A: '#eab700',
  base0B: '#718c00',
  base0C: '#3e999f',
  base0D: '#4271ae',
  base0E: '#8959a8',
  base0F: '#a3685a',
};

const tomorrowDark = {
  scheme: 'Tomorrow Night',
  author: 'Chris Kempson (http://chriskempson.com)',
  base00: '#1d1f21',
  base01: '#282a2e',
  base02: '#373b41',
  base03: '#969896',
  base04: '#b4b7b4',
  base05: '#c5c8c6',
  base06: '#e0e0e0',
  base07: '#ffffff',
  base08: '#cc6666',
  base09: '#de935f',
  base0A: '#f0c674',
  base0B: '#b5bd68',
  base0C: '#8abeb7',
  base0D: '#81a2be',
  base0E: '#b294bb',
  base0F: '#a3685a',
};

function TemplatePreview({
  plugin,
  formatIndex,
  templateData,
}: {
  plugin: ZoteroConnector;
  formatIndex: number | null;
  templateData: Record<any, any>;
}) {
  const [templateError, setTemplateError] = React.useState<null | string>(null);
  const [template, setTemplate] = React.useState<null | string>(null);
  const [forceRef, setForceRef] = React.useState<number>(0);

  React.useEffect(() => {
    const fmt = plugin.settings.exportFormats[formatIndex];
    const mainFile = fmt.templatePath
      ? plugin.app.vault.getAbstractFileByPath(
          sanitizeObsidianPath(fmt.templatePath)
        )
      : null;

    const onUpdate = (file: TFile) => {
      if (!file) return;
      if (file === mainFile) {
        setForceRef(Date.now());
      }
    };

    const onSettingsUpdate = () => {
      setForceRef(Date.now());
    };

    plugin.emitter.on('fileUpdated', onUpdate);
    plugin.emitter.on('settingsUpdated', onSettingsUpdate);

    return () => {
      plugin.emitter.off('fileUpdated', onUpdate);
      plugin.emitter.off('settingsUpdated', onSettingsUpdate);
    };
  }, [formatIndex]);

  React.useEffect(() => {
    setTemplateError(null);

    if (formatIndex === null) return;

    const params: ExportToMarkdownParams = {
      settings: plugin.settings,
      database: {
        database: plugin.settings.database,
        port: plugin.settings.port,
      },
      exportFormat: plugin.settings.exportFormats[formatIndex],
    };

    const render = async () => {
      try {
        const existingMarkdown = '';
        const lastImportDate = moment(0);

        const output = await renderTemplates(
          params,
          PersistExtension.prepareTemplateData(
            {
              ...templateData,
              lastImportDate,

              // legacy
              lastExportDate: lastImportDate,
            },
            existingMarkdown
          ),
          '',
          true
        );

        setTemplate(output ? output : null);
      } catch (e) {
        setTemplateError(e.message);
      }
    };

    render();
  }, [formatIndex, forceRef, templateData]);

  if (!template && !templateError) return null;

  return (
    <div className={`zt-json-viewer__preview${templateError ? ' error' : ''}`}>
      <pre>
        <code>{templateError || template}</code>
      </pre>
    </div>
  );
}

function DataExporer({ plugin }: { plugin: ZoteroConnector }) {
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Record<any, any> | null>(null);
  const [previewFormatIndex, setPreviewFormatIndex] = React.useState<
    number | null
  >(null);

  const promptForSelection = React.useCallback(() => {
    dataExplorerPrompt(plugin.settings).then((res) => {
      if (!res || res.length === 0) {
        setError('No data retrieved');
      } else {
        setError(null);
        setData(res[0]);
      }
    });
  }, []);

  return (
    <div className="zt-json-viewer">
      <div className="zt-json-viewer__btns">
        <div>
          <button onClick={promptForSelection}>Prompt For Selection</button>
        </div>
        <div>
          <select
            className="dropdown"
            onChange={(e) => {
              if ((e.target as HTMLSelectElement).value) {
                setPreviewFormatIndex(
                  Number((e.target as HTMLSelectElement).value)
                );
              } else {
                setPreviewFormatIndex(null);
              }
            }}
          >
            <option value="">Preview Import Format</option>
            {plugin.settings.exportFormats.map((e, index) => {
              return (
                <option key={index} value={index}>
                  {e.name}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {error ? (
        <div>{error}</div>
      ) : (
        <div>
          {data && (
            <>
              {previewFormatIndex !== null && (
                <TemplatePreview
                  plugin={plugin}
                  formatIndex={previewFormatIndex}
                  templateData={data}
                />
              )}
              <div className="zt-json-viewer__data">
                <JSONTree
                  data={data}
                  sortObjectKeys={(a: string, b: string) => a.localeCompare(b)}
                  isCustomNode={(v) => v instanceof moment}
                  valueRenderer={valueRenderer}
                  labelRenderer={labelRenderer}
                  theme={
                    document.body.hasClass('theme-dark')
                      ? tomorrowDark
                      : tomorrowLight
                  }
                  invertTheme={false}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export class DataExplorerView extends ItemView {
  plugin: ZoteroConnector;
  data?: Record<any, any>;
  exportFormat?: ExportFormat;

  constructor(plugin: ZoteroConnector, leaf: WorkspaceLeaf) {
    super(leaf);
    this.plugin = plugin;
    this.mountJsonViewer();
  }

  getViewType() {
    return viewType;
  }

  getIcon() {
    return 'gear';
  }

  getDisplayText() {
    return 'Zotero Data Explorer';
  }

  mountJsonViewer() {
    ReactDOM.unmountComponentAtNode(this.contentEl);
    ReactDOM.render(<DataExporer plugin={this.plugin} />, this.contentEl);
  }

  unmountJsonViewer() {
    ReactDOM.unmountComponentAtNode(this.contentEl);
  }

  async onClose() {
    this.unmountJsonViewer();
  }
}

/**
 * The following has been copied & modified from:
 * https://github.com/PKM-er/obsidian-zotlit/tree/dcd41794fd96f92c1866e870821aeb128507b339/app/obsidian/src/components/item-details
 */

const labelRenderer: LabelRenderer = (keyPathWithRoot, nodeType) => {
  const isRoot = keyPathWithRoot.length === 1;
  const keyPath = keyPathWithRoot.slice(0, -1);
  const path = getKeyName(keyPath);
  const handler = (evt: MouseEvent) => {
    const menu = new Menu().addItem((i) =>
      i
        .setIcon('lucide-copy')
        .setTitle('Copy template path')
        .onClick(() => {
          navigator.clipboard.writeText(`{{${path}}}`);
        })
    );

    if (nodeType === 'Array') {
      menu.addItem((i) =>
        i
          .setIcon('lucide-copy')
          .setTitle('Copy template for loop')
          .onClick(() => {
            navigator.clipboard.writeText(
              `{% for item in ${path} %}\n{% item %}\n{% endfor %}`
            );
          })
      );
    }
    evt.preventDefault();
    menu.showAtMouseEvent(evt);
  };

  return (
    <span onContextMenu={isRoot ? undefined : handler}>
      {isRoot ? 'Template Data' : keyPathWithRoot[0]}
    </span>
  );
};

const getKeyName = (keyPath: (string | number)[]) =>
  keyPath.map(toPropName).reverse().join('');

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#identifiers
const identifiers = /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u;
const toPropName = (
  key: string | number,
  i: number,
  arr: Array<string | number>
) => {
  if (typeof key === 'number') return `[${key}]`;
  if (identifiers.test(key)) return i === arr.length - 1 ? `${key}` : `.${key}`;
  return `[${JSON.stringify(key)}]`;
};

// matches #RGB, #RGBA, #RRGGBB, #RRGGBBAA
const hex = /^#(?:[\dA-F]{3}){1,2}$|^#(?:[\dA-F]{4}){1,2}$/i;

export const valueRenderer: ValueRenderer = (valueAsString, value) => {
  if (value instanceof moment) {
    return <>📅 {(value as moment.Moment).format('l LTS')}</>;
  }

  if (typeof value === 'string' && hex.test(value)) {
    return (
      <>
        <span
          style={{
            backgroundColor: value,
          }}
          className="zt-color-chip"
        ></span>
        {value}
      </>
    );
  }

  if (typeof value === 'string' && value.length > 800) {
    return value.slice(0, 800) + '...';
  }

  return valueAsString;
};
