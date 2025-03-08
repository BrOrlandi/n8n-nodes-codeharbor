import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
} from "n8n-workflow";

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
			displayName: 'Input',
		}],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [{
			type: NodeConnectionType.Main,
			displayName: 'Output',
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
				default: "// This function runs once and receives all items as an array\n// You can use external npm packages by requiring them\n// Example: const lodash = require('lodash');\n\nmodule.exports = function(items) {\n  console.log('Processing batch of', items.length, 'items');\n  \n  // Process all items in a single execution\n  const results = items.map(item => {\n    // Process each item\n    console.log('Processing:', item);\n    \n    // Return a new object with processed data\n    return {\n      ...item,\n    };\n  });\n  \n  return results;\n};",
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
				default: "// This function runs once for each item\n// You can use external npm packages by requiring them\n// Example: const lodash = require('lodash');\n\nmodule.exports = function(item) {\n  console.log('Processing item:', item);\n  \n  // Process the single item\n  const result = {\n    ...item,\n};\n  \n  return result;\n};",
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
				displayName: "Capture Console Output",
				name: "captureConsole",
				type: "boolean",
				default: true,
				description: "Whether to capture console.log output from the executed code",
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('codeHarborServerApi');
		const mode = this.getNodeParameter('mode', 0) as string;

		this.logger.info('credentials');
		this.logger.info(JSON.stringify(credentials));

		if (mode === 'runOnceForAllItems') {
			// Run code once for all items
			try {
				const code = this.getNodeParameter('code', 0) as string;
				const inputItems = items.map(item => item.json);
				const cacheKey = this.getNodeParameter('cacheKey', 0) as string;
				const timeout = this.getNodeParameter('timeout', 0) as number;
				const forceUpdate = this.getNodeParameter('forceUpdate', 0) as boolean;
				const debug = this.getNodeParameter('debug', 0) as boolean;
				const captureConsole = this.getNodeParameter('captureConsole', 0) as boolean;

				// Make API request to CodeHarbor service
				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: credentials.url + '/execute',
					headers: {
						'Authorization': `Bearer ${credentials.apiKey}`,
					},
					body: {
						code,
						items: inputItems,
						cacheKey,
						options: {
							timeout,
							forceUpdate,
							debug,
							captureConsole,
						},
					},
				});

				// Process the response
				if (response.success) {
					if (Array.isArray(response.data)) {
						// Handle array of results - wrap each item in a result property
						response.data.forEach((item, index) => {
							const outputJson: Record<string, any> = {
								result: item
							};

							// Add console logs if available
							if (captureConsole && response.consoleOutput) {
								outputJson._consoleOutput = response.consoleOutput;
							}

							// Add debug info if requested
							if (debug && response.debug) {
								outputJson._debug = response.debug;
							}

							returnData.push({
								json: outputJson,
								pairedItem: index < items.length ? { item: index } : undefined,
							});
						});
					} else {
						// Handle single result - wrap in a result property
						const outputJson: Record<string, any> = {
							result: response.data
						};

						// Add debug info if requested
						if (debug && response.debug) {
							outputJson._debug = response.debug;
						}

						// Add console logs if available
						if (captureConsole && response.consoleOutput) {
							outputJson._consoleOutput = response.consoleOutput;
						}

						returnData.push({
							json: outputJson,
							pairedItem: { item: 0 }
						});
					}
				} else {
					// Handle error response
					throw new Error(response.error || 'Unknown error occurred');
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
						pairedItem: { item: 0 },
					});
				} else {
					throw error;
				}
			}
		} else {
			// Run code once for each item
			for (let i = 0; i < items.length; i++) {
				try {
					const code = this.getNodeParameter('code', i) as string;
					const inputItem = this.getNodeParameter('items', i);
					const cacheKey = this.getNodeParameter('cacheKey', i) as string;
					const timeout = this.getNodeParameter('timeout', i) as number;
					const forceUpdate = this.getNodeParameter('forceUpdate', i) as boolean;
					const debug = this.getNodeParameter('debug', i) as boolean;
					const captureConsole = this.getNodeParameter('captureConsole', i) as boolean;

					// Make API request to CodeHarbor service
					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: credentials.url + '/execute',
						headers: {
							'Authorization': `Bearer ${credentials.apiKey}`,
						},
						body: {
							code,
							items: inputItem, // Use the inputItem from the "items" parameter
							cacheKey,
							options: {
								timeout,
								forceUpdate,
								debug,
								captureConsole,
							},
						},
					});

					// Process the response
					if (response.success) {
						if (Array.isArray(response.data)) {
							// Handle array of results
							response.data.forEach(item => {
								const outputJson: Record<string, any> = {
									result: item
								};

								// Add console logs if available
								if (captureConsole && response.consoleOutput) {
									outputJson._consoleOutput = response.consoleOutput;
								}

								// Add debug info if requested
								if (debug && response.debug) {
									outputJson._debug = response.debug;
								}

								returnData.push({
									json: outputJson,
									pairedItem: { item: i }
								});
							});
						} else {
							// Handle single result
							const outputJson: Record<string, any> = {
								result: response.data
							};

							// Add debug info if requested
							if (debug && response.debug) {
								outputJson._debug = response.debug;
							}

							// Add console logs if available
							if (captureConsole && response.consoleOutput) {
								outputJson._consoleOutput = response.consoleOutput;
							}

							returnData.push({
								json: outputJson,
								pairedItem: { item: i }
							});
						}
					} else {
						// Handle error response
						throw new Error(response.error || 'Unknown error occurred');
					}
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: error.message,
							},
							pairedItem: { item: i },
						});
					} else {
						throw error;
					}
				}
			}
		}

		return [returnData];
	}
}
