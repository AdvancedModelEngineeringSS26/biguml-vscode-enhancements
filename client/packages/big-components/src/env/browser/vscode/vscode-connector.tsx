/**********************************************************************************
 * Copyright (c) 2025 borkdominik and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License which is available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: MIT
 **********************************************************************************/
import { messenger } from '@borkdominik-biguml/big-components';
import { ActionWebviewProtocol, WebviewProtocol } from '@borkdominik-biguml/big-vscode';
import type { Action, ResponseAction } from '@eclipse-glsp/protocol';
import type { ActionMessage } from '@eclipse-glsp/vscode-integration';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import { VSCodeContext } from './vscode-context.js';

messenger.start();

export interface VSCodeConnectorProps {
    children: React.ReactNode;
    debug?: boolean;
}

/**
 * The VSCodeConnector component provides a context for the VSCode integration.
 * It listens for messages from the VSCode extension and provides a way to dispatch actions.
 *
 * Use {@link VSCodeContext} to access the context in child components.
 */
export function VSCodeConnector(props: VSCodeConnectorProps): ReactElement {
    const [clientId, setClientId] = useState<string | undefined>();
    const [isReady, setIsReady] = useState<boolean>(false);

    const debug = useCallback(
        (message: string, ...objects: any) => {
            if (props.debug) {
                console.log('[React-VSCodeConnector] ', message, ...objects);
            }
        },
        [props.debug]
    );

    useEffect(() => {
        if (isReady) {
            return;
        }

        setIsReady(true);
        messenger.sendNotification(WebviewProtocol.Ready, HOST_EXTENSION);
        debug('webview is ready');
    }, [isReady, debug]);

    useEffect(() => {
        const onActionMessage = messenger.listenNotification<ActionMessage>(ActionWebviewProtocol.Message, message => {
            setClientId(message.clientId);
        });
        return () => {
            onActionMessage.dispose();
        };
    }, [props, debug]);

    const listenAction = useCallback(
        (handler: (action: Action) => void) => {
            return messenger.listenNotification<ActionMessage>(ActionWebviewProtocol.Message, message => {
                debug('new action received', message);
                handler(message.action);
            });
        },
        [debug]
    );

    const dispatchAction = useCallback(
        (action: Action) => {
            debug('dispatching action', action);

            messenger.sendNotification(ActionWebviewProtocol.Message, HOST_EXTENSION, {
                clientId: clientId ?? '',
                action
            });
        },
        [clientId, debug]
    );

    const requestAction = useCallback(
        async <TResponse extends ResponseAction = ResponseAction>(action: Action): Promise<TResponse> => {
            debug('requesting action', action);

            const response = await messenger.sendRequest<ActionMessage, ActionMessage>(ActionWebviewProtocol.Request, HOST_EXTENSION, {
                clientId: clientId ?? '',
                action
            });

            return response.action as TResponse;
        },
        [clientId, debug]
    );

    return (
        <VSCodeContext.Provider
            value={{
                clientId,
                listenNotification: (type, handler) => messenger.onNotification(type, handler),
                dispatchNotification: (type, params) => messenger.sendNotification(type, HOST_EXTENSION, params),
                listenAction,
                dispatchAction,
                requestAction
            }}
        >
            {props.children}
        </VSCodeContext.Provider>
    );
}
