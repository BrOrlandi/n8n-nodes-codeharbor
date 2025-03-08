import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError,
} from "n8n-workflow";

interface CodeHarborOptions {
	timeout: number;
	forceUpdate: boolean;
	debug: boolean;
}

interface CodeHarborCredentials {
	apiKey: string;
	url: string;
}

interface CodeHarborResponse {
	success: boolean;
	data: unknown;
	console?: unknown[];
	debug?: IDataObject;
	error?: string;
}

export class CodeHarbor implements INodeType {
	description: INodeTypeDescription = {
		displayName: "CodeHarbor",
		name: 'codeHarbor',
		icon: "file:icon.svg",
		group: ["transform"],
		version: 1,
		subtitle: 'Execute JavaScript code',
		description: "Execute JavaScript code with dependencies in a Docker container environment",
		defaults: {
			name: "CodeHarbor",
		},
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [{
			type: NodeConnectionType.Main,
			// displayName: 'Input',
		}],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [{
			type: NodeConnectionType.Main,
			// displayName: 'Output',
		}],
		credentials: [
			{
				name: 'codeHarborServerApi',
				required: true,
			},
		],
		requestDefaults: {
			headers: {
				Accept: "application/json",
				'Content-Type': 'application/json',
			},
			baseURL: "={{ $credentials.url }}",
		},
		properties: [
			// Mode selection
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				options: [
					{
						name: 'Run Once for All Items',
						value: 'runOnceForAllItems',
					},
					{
						name: 'Run Once for Each Item',
						value: 'runOnceForEachItem',
					},
				],
				default: 'runOnceForAllItems',
				description: 'Whether to run the code once for all items or once for each item',
			},
			// Code execution properties - FOR ALL ITEMS mode
			{
				displayName: "Code",
				name: "code",
				type: "string",
				typeOptions: {
					editor: "jsEditor",
					editorLanguage: "javascript",
				},
				displayOptions: {
					show: {
						mode: [
							"runOnceForAllItems",
						]
					}
				},
				default: "// This function runs once and receives all items as an array\n// You can use external npm packages by requiring them\n\nmodule.exports = function(items) {\n  console.log('Processing batch of', items.length, 'items');\n  \n  // Process all items in a single execution\n  const results = items.map(item => {\n    // Process each item\n    console.log('Processing:', item);\n    \n    // Return a new object with processed data\n    return {\n      ...item,\n    };\n  });\n  \n  return results;\n};",
				description: "JavaScript code to execute. Must export a function that takes items array and returns processed data. You can use console.log for debugging.",
				required: true,
			},
			// Code execution properties - FOR EACH ITEM mode
			{
				displayName: "Code",
				name: "code",
				type: "string",
				typeOptions: {
					editor: "jsEditor",
					editorLanguage: "javascript",
				},
				displayOptions: {
					show: {
						mode: [
							"runOnceForEachItem",
						]
					}
				},
				default: "// This function runs once for each item\n// You can use external npm packages by requiring them\n\nmodule.exports = function(item) {\n  console.log('Processing item:', item);\n  \n  // Process the single item\n  const result = {\n    ...item,\n};\n  \n  return result;\n};",
				description: "JavaScript code to execute. Must export a function that takes a single item and returns processed data. You can use console.log for debugging.",
				required: true,
			},
			{
				displayName: "Input Items",
				name: "items",
				type: "json",
				displayOptions: {
					show: {
						mode: [
							"runOnceForEachItem",
						]
					}
				},
				default: "={{ $json }}",
				description: "The input data to pass to the JavaScript function for each item",
			},
			{
				displayName: "Cache Key",
				name: "cacheKey",
				type: "string",
				default: "={{ $workflow.id }}",
				description: "Unique identifier for caching dependencies",
				required: true,
			},
			{
				displayName: "Timeout",
				name: "timeout",
				type: "number",
				default: 60000,
				description: "Maximum execution time in milliseconds",
			},
			{
				displayName: "Force Update Dependencies",
				name: "forceUpdate",
				type: "boolean",
				default: false,
				description: "Whether to force fresh installation of dependencies",
			},
			{
				displayName: "Debug Mode",
				name: "debug",
				type: "boolean",
				default: false,
				description: "Whether to return detailed debug information about the execution",
			},
			{
				displayName: "Capture Console Logs",
				name: "captureLogs",
				type: "boolean",
				default: false,
				description: "Whether to include console logs in the output data",
			},
		],
	};

	// Helper function to process the response and create output items
	private processResponseItem(
		item: unknown,
		debug: boolean,
		captureLogs: boolean,
		responseDebug: IDataObject | undefined,
		consoleOutput: unknown[],
		pairedItem: { item: number } | undefined
	): INodeExecutionData {
		const outputJson: IDataObject = {};

		// Add the result, ensuring it's a valid type for IDataObject
		if (item !== null && item !== undefined) {
			outputJson.result = item as IDataObject;
		} else {
			outputJson.result = null;
		}

		// Add debug info if requested
		if (debug && responseDebug) {
			outputJson._debug = responseDebug;
		}

		// Add console logs if capture is enabled
		if (captureLogs && Array.isArray(consoleOutput) && consoleOutput.length > 0) {
			outputJson._console = consoleOutput;
		}

		return {
			json: outputJson,
			pairedItem
		};
	}

	// Helper function to process array responses
	private processArrayResponse(
		responseData: unknown[],
		debug: boolean,
		captureLogs: boolean,
		responseDebug: IDataObject | undefined,
		consoleOutput: unknown[],
		itemIndex: number,
		inputItems?: INodeExecutionData[]
	): INodeExecutionData[] {
		const returnItems: INodeExecutionData[] = [];

		responseData.forEach((item, index) => {
			const pairedItem = inputItems
				? (index < inputItems.length ? { item: index } : undefined)
				: { item: itemIndex };

			returnItems.push(this.processResponseItem(
				item,
				debug,
				captureLogs,
				responseDebug,
				consoleOutput,
				pairedItem
			));
		});

		return returnItems;
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const credentials = await this.getCredentials('codeHarborServerApi') as unknown as CodeHarborCredentials;
		const mode = this.getNodeParameter('mode', 0) as string;
		let returnData: INodeExecutionData[] = [];

		// Helper function to execute code - defined inside the execute method to have access to "this"
		const executeCodeRun = async (
			code: string,
			items: unknown,
			cacheKey: string,
			timeout: number,
			forceUpdate: boolean,
			debug: boolean,
			captureLogs: boolean,
			itemIndex: number = 0,
			inputItems?: INodeExecutionData[]
		): Promise<INodeExecutionData[]> => {
			try {
				// Create request body
				const requestBody: IDataObject = {
					code,
					items: items as IDataObject,
					cacheKey,
					options: {
						timeout,
						forceUpdate,
						debug,
					},
				};

				// Make API request to CodeHarbor service
				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: credentials.url + '/execute',
					headers: {
						'Authorization': `Bearer ${credentials.apiKey}`,
					},
					body: requestBody,
				}) as CodeHarborResponse;

				// Process the response
				if (response.success) {
					const consoleOutput = Array.isArray(response.console) ? response.console : [];
					const debugData = response.debug as IDataObject | undefined;

					if (Array.isArray(response.data)) {
						// Handle array of results
						const returnItems: INodeExecutionData[] = [];

						response.data.forEach((item, index) => {
							const pairedItem = inputItems
								? (index < inputItems.length ? { item: index } : undefined)
								: { item: itemIndex };

							const outputJson: IDataObject = {};

							// Add the result, ensuring it's a valid type for IDataObject
							if (item !== null && item !== undefined) {
								outputJson.result = item as IDataObject;
							} else {
								outputJson.result = null;
							}

							// Add debug info if requested
							if (debug && debugData) {
								outputJson._debug = debugData;
							}

							// Add console logs if capture is enabled
							if (captureLogs && Array.isArray(consoleOutput) && consoleOutput.length > 0) {
								outputJson._console = consoleOutput;
							}

							returnItems.push({
								json: outputJson,
								pairedItem
							});
						});

						return returnItems;
					} else {
						// Handle single result
						const outputJson: IDataObject = {};

						// Add the result
						if (response.data !== null && response.data !== undefined) {
							outputJson.result = response.data as IDataObject;
						} else {
							outputJson.result = null;
						}

						// Add debug info if requested
						if (debug && debugData) {
							outputJson._debug = debugData;
						}

						// Add console logs if capture is enabled
						if (captureLogs && Array.isArray(consoleOutput) && consoleOutput.length > 0) {
							outputJson._console = consoleOutput;
						}

						return [{
							json: outputJson,
							pairedItem: { item: itemIndex }
						}];
					}
				} else {
					// Handle error response
					throw new NodeOperationError(this.getNode(), response.error || 'Unknown error occurred');
				}
			} catch (error) {
				if (this.continueOnFail()) {
					return [{
						json: {
							error: error.message,
						},
						pairedItem: { item: itemIndex },
					}];
				} else {
					throw error;
				}
			}
		};

		if (mode === 'runOnceForAllItems') {
			// Run code once for all items
			const code = this.getNodeParameter('code', 0) as string;
			const inputItems = items.map(item => item.json);
			const cacheKey = this.getNodeParameter('cacheKey', 0) as string;
			const timeout = this.getNodeParameter('timeout', 0) as number;
			const forceUpdate = this.getNodeParameter('forceUpdate', 0) as boolean;
			const debug = this.getNodeParameter('debug', 0) as boolean;
			const captureLogs = this.getNodeParameter('captureLogs', 0) as boolean;

			returnData = await executeCodeRun(
				code,
				inputItems,
				cacheKey,
				timeout,
				forceUpdate,
				debug,
				captureLogs,
				0,
				items
			);
		} else {
			// Run code once for each item
			for (let i = 0; i < items.length; i++) {
				const code = this.getNodeParameter('code', i) as string;
				const inputItem = this.getNodeParameter('items', i);
				const cacheKey = this.getNodeParameter('cacheKey', i) as string;
				const timeout = this.getNodeParameter('timeout', i) as number;
				const forceUpdate = this.getNodeParameter('forceUpdate', i) as boolean;
				const debug = this.getNodeParameter('debug', i) as boolean;
				const captureLogs = this.getNodeParameter('captureLogs', i) as boolean;

				const itemResults = await executeCodeRun(
					code,
					inputItem,
					cacheKey,
					timeout,
					forceUpdate,
					debug,
					captureLogs,
					i
				);

				returnData.push(...itemResults);
			}
		}

		return [returnData];
	}
}
