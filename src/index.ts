// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.


import {
    ILabShell,
    ILayoutRestorer,
    JupyterFrontEnd,
    JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
    ICommandPalette,
    MainAreaWidget,
    WidgetTracker
} from '@jupyterlab/apputils';
import { IConsoleTracker } from '@jupyterlab/console';
// import {
//   IInspector,
//   InspectionHandler,
//   InspectorPanel,
//   KernelConnector
// } from '@jupyterlab/inspector';
import { IInspector } from './tokens';
import { InspectionHandler } from './handler';
import { InspectorPanel } from './inspector';
import { KernelConnector } from './kernelconnector';


import { ILauncher } from '@jupyterlab/launcher';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ITranslator } from '@jupyterlab/translation';
import { inspectorIcon } from '@jupyterlab/ui-components';

/**
 * The command IDs used by the inspector plugin.
 */
namespace CommandIDs {
    export const open = 'myinspector:open';
    export const close = 'myinspector:close';
    export const toggle = 'myinspector:toggle';
    export const trigger = 'myinspector:trigger';
    export const toggleStandby = 'myinspector:toggleStandby';
}

/**
 * A service providing code introspection.
 */
const inspector: JupyterFrontEndPlugin<IInspector> = {
    id: 'jupyterlab_pausable_contextual_help:inspector',
    requires: [ITranslator],
    optional: [ICommandPalette, ILauncher, ILayoutRestorer],
    provides: IInspector,
    autoStart: true,
    activate: (
        app: JupyterFrontEnd,
        translator: ITranslator,
        palette: ICommandPalette | null,
        launcher: ILauncher | null,
        restorer: ILayoutRestorer | null
    ): IInspector => {
        const trans = translator.load('jupyterlab');
        const { commands, shell } = app;
        const caption = trans.__(
            'Manually updating code documentation from the active kernel'
        );
        const openedLabel = trans.__('My Contextual Help');
        const namespace = 'inspector';
        const datasetKey = 'jpInspector';
        const tracker = new WidgetTracker<MainAreaWidget<InspectorPanel>>({
            namespace
        });

        function isInspectorOpen() {
            return inspector && !inspector.isDisposed;
        }

        function isStandby() {
            // return inspector && inspector.content && inspector.content.source && inspector.content.source.standby;
            if (inspector && inspector.content && inspector.content.source) {
                return inspector.content.source.standby;
            }
            return false;
        }

        let source: IInspector.IInspectable | null = null;
        let inspector: MainAreaWidget<InspectorPanel>;
        function openInspector(args: string): MainAreaWidget<InspectorPanel> {
            if (!isInspectorOpen()) {
                inspector = new MainAreaWidget({
                    content: new InspectorPanel({ translator })
                });
                inspector.id = 'jp-inspector';
                inspector.title.label = openedLabel;
                inspector.title.icon = inspectorIcon;
                void tracker.add(inspector);
                source = source && !source.isDisposed ? source : null;
                inspector.content.source = source;
                inspector.content.source?.onEditorChange(args);
            }
            if (!inspector.isAttached) {
                shell.add(inspector, 'main', {
                    activate: false,
                    mode: 'split-right'
                });
            }
            shell.activateById(inspector.id);
            document.body.dataset[datasetKey] = 'open';
            return inspector;
        }
        function closeInspector(): void {
            inspector.dispose();
            delete document.body.dataset[datasetKey];
        }

        // Add inspector:open command to registry.
        const showLabel = trans.__('Open My Contextual Help');
        commands.addCommand(CommandIDs.open, {
            caption,
            isEnabled: () =>
                !inspector ||
                inspector.isDisposed ||
                !inspector.isAttached ||
                !inspector.isVisible,
            label: showLabel,
            icon: args => (args.isLauncher ? inspectorIcon : undefined),
            execute: args => {
                const text = args && (args.text as string);
                const refresh = args && (args.refresh as boolean);
                // if inspector is open, see if we need a refresh
                if (isInspectorOpen() && refresh)
                    inspector.content.source?.onEditorChange(text);
                else openInspector(text);
            }
        });
        // Add inspector:close command to registry.
        const closeLabel = trans.__('Hide My Contextual Help');
        commands.addCommand(CommandIDs.close, {
            caption,
            isEnabled: () => isInspectorOpen(),
            label: closeLabel,
            icon: args => (args.isLauncher ? inspectorIcon : undefined),
            execute: () => closeInspector()
        });

        // Add inspector:toggle command to registry.
        const toggleLabel = trans.__('Show My Contextual Help');
        commands.addCommand(CommandIDs.toggle, {
            caption,
            label: toggleLabel,
            isToggled: () => isInspectorOpen(),
            execute: args => {
                if (isInspectorOpen()) {
                    closeInspector();
                } else {
                    const text = args && (args.text as string);
                    openInspector(text);
                }
            }
        });

        // Add inspector:trigger command to registry.
        const triggerLabel = trans.__('Trigger My Contextual Help');
        commands.addCommand(CommandIDs.trigger, {
            caption,
            isEnabled: () => isStandby(),
            label: triggerLabel,
            execute: () => {
                if (inspector && inspector.content && inspector.content.source && isStandby()) {
                    inspector.content.source.standby = false;
                    inspector.content.source?.onEditorChange();
                    inspector.content.source.standby = true;
                }
            }
        });

        // Add inspector:toggleStandby command to registry.
        const toggleStandbyLabel = trans.__('Auto Update My Contextual Help');
        commands.addCommand(CommandIDs.toggleStandby, {
            caption,
            isToggled: () => !isStandby(),
            label: toggleStandbyLabel,
            execute: () => {
                if (inspector && inspector.content && inspector.content.source) {
                    if (isStandby()) {
                        inspector.content.source.standby = false;
                    } else {
                        inspector.content.source.standby = true;
                    }
                }
            }
        });

        // Add open command to launcher if possible.
        if (launcher) {
            launcher.add({ command: CommandIDs.open, args: { isLauncher: true } });
        }

        // Add toggle command to command palette if possible.
        if (palette) {
            palette.addItem({ command: CommandIDs.toggle, category: toggleLabel });
        }

        // Handle state restoration.
        if (restorer) {
            void restorer.restore(tracker, {
                command: CommandIDs.toggle,
                name: () => 'inspector'
            });
        }

        // Create a proxy to pass the `source` to the current inspector.
        const proxy = Object.defineProperty({} as IInspector, 'source', {
            get: (): IInspector.IInspectable | null =>
                !inspector || inspector.isDisposed ? null : inspector.content.source,
            set: (src: IInspector.IInspectable | null) => {
                source = src && !src.isDisposed ? src : null;
                if (inspector && !inspector.isDisposed) {
                    inspector.content.source = source;
                }
            }
        });

        return proxy;
    }
};

/**
 * An extension that registers consoles for inspection.
 */
const consoles: JupyterFrontEndPlugin<void> = {
    id: 'jupyterlab_pausable_contextual_help:consoles',
    requires: [IInspector, IConsoleTracker, ILabShell],
    autoStart: true,
    activate: (
        app: JupyterFrontEnd,
        manager: IInspector,
        consoles: IConsoleTracker,
        labShell: ILabShell,
        translator: ITranslator
    ): void => {
        // Maintain association of new consoles with their respective handlers.
        const handlers: { [id: string]: InspectionHandler } = {};

        // Create a handler for each console that is created.
        consoles.widgetAdded.connect((sender, parent) => {
            const sessionContext = parent.console.sessionContext;
            const rendermime = parent.console.rendermime;
            const connector = new KernelConnector({ sessionContext });
            const handler = new InspectionHandler({ connector, rendermime });

            // Associate the handler to the widget.
            handlers[parent.id] = handler;

            // Set the initial editor.
            const cell = parent.console.promptCell;
            handler.editor = cell && cell.editor;

            // Listen for prompt creation.
            parent.console.promptCellCreated.connect((sender, cell) => {
                handler.editor = cell && cell.editor;
            });

            // Listen for parent disposal.
            parent.disposed.connect(() => {
                delete handlers[parent.id];
                handler.dispose();
            });
        });

        // Keep track of console instances and set inspector source.
        labShell.currentChanged.connect((_, args) => {
            const widget = args.newValue;
            if (!widget || !consoles.has(widget)) {
                return;
            }
            const source = handlers[widget.id];
            if (source) {
                manager.source = source;
            }
        });

        app.contextMenu.addItem({
            command: CommandIDs.toggle,
            selector: '.jp-CodeConsole-promptCell'
        });

        app.contextMenu.addItem({
            command: CommandIDs.toggleStandby,
            selector: '.jp-CodeConsole-promptCell'
        });
    }
};

/**
 * An extension that registers notebooks for inspection.
 */
const notebooks: JupyterFrontEndPlugin<void> = {
    id: 'jupyterlab_pausable_contextual_help:notebooks',
    requires: [IInspector, INotebookTracker, ILabShell],
    autoStart: true,
    activate: (
        app: JupyterFrontEnd,
        manager: IInspector,
        notebooks: INotebookTracker,
        labShell: ILabShell
    ): void => {
        // Maintain association of new notebooks with their respective handlers.
        const handlers: { [id: string]: InspectionHandler } = {};

        // Create a handler for each notebook that is created.
        notebooks.widgetAdded.connect((sender, parent) => {
            const sessionContext = parent.sessionContext;
            const rendermime = parent.content.rendermime;
            const connector = new KernelConnector({ sessionContext });
            const handler = new InspectionHandler({ connector, rendermime });

            // Associate the handler to the widget.
            handlers[parent.id] = handler;

            // Set the initial editor.
            const cell = parent.content.activeCell;
            handler.editor = cell && cell.editor;

            // Listen for active cell changes.
            parent.content.activeCellChanged.connect((sender, cell) => {
                handler.editor = cell && cell.editor;
            });

            // Listen for parent disposal.
            parent.disposed.connect(() => {
                delete handlers[parent.id];
                handler.dispose();
            });
        });

        // Keep track of notebook instances and set inspector source.
        labShell.currentChanged.connect((sender, args) => {
            const widget = args.newValue;
            if (!widget || !notebooks.has(widget)) {
                return;
            }
            const source = handlers[widget.id];
            if (source) {
                manager.source = source;
            }
        });

        app.contextMenu.addItem({
            command: CommandIDs.toggle,
            selector: '.jp-Notebook'
        });

        app.contextMenu.addItem({
            command: CommandIDs.toggleStandby,
            selector: '.jp-Notebook'
        });

    }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [inspector, consoles, notebooks];
export default plugins;
