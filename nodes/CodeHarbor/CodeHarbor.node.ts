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
			// Code execution properties
			{
				displayName: "Code",
				name: "code",
				type: "string",
				typeOptions: {
					editor: "jsEditor",
					editorLanguage: "javascript",
				},
				default: "module.exports = function(items) {\n  // Your code here\n  // Example: Transform input items\n  console.log('Processing items:', items.length);\n\n  return items.map(item => {\n    // Process each item\n    console.log('Processing item:', item);\n    return item;\n  });\n}",
				description: "JavaScript code to execute. Must export a function that takes input items and returns processed data. You can use console.log for debugging.",
				required: true,
			},
			{
				displayName: "Input Items",
				name: "items",
				type: "json",
				default: "={{ $json }}",
				description: "The input data to pass to the JavaScript function",
			},
			{
				displayName: "Cache Key",
				name: "cacheKey",
				type: "string",
				default: "={{ $workflow.id }}-{{ $node.id }}",
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

		this.logger.info('credentials');
		this.logger.info(JSON.stringify(credentials));


		for (let i = 0; i < items.length; i++) {
			try {
				const code = this.getNodeParameter('code', i) as string;
				const inputItems = this.getNodeParameter('items', i);
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

		return [returnData];
	}
}
