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
		subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
		description: "Execute JavaScript code with dependencies in a Docker container environment",
		defaults: {
			name: "CodeHarbor",
		},
			// Fix type errors by simplifying to use n8n standard notation
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
				name: 'codeHarborServerApi', // Make sure this is lowercase to match the credential name property
				required: true,
			},
		],
		requestDefaults: {
			headers: {
				Accept: "application/json",
				'Content-Type': 'application/json',
			},
			baseURL: "https://codeharbor.brorlandi.xyz",
		},
		properties: [
			{
				displayName: "Resource",
				name: "resource",
				type: "options",
				noDataExpression: true,
				options: [
					{
						name: "Project",
						value: "project",
						},
					{
						name: "Code",
						value: "code",
					},
				],
				default: "code",
			},
			{
				displayName: "Operation",
				name: "operation",
				type: "options",
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: [
							"project",
						],
					},
				},
				options: [
					{
						name: "Create",
						value: "create",
						action: 'Create a project',
					},
					{
						name: "Delete",
						value: "delete",
						action: 'Delete a project',
					},
					{
						name: "Get",
						value: "get",
						action: 'Get a project',
					},
					{
						name: "Update",
						value: "update",
						action: 'Update a project',
					},
				],
				default: "get",
			},
			{
				displayName: "Operation",
				name: "operation",
				type: "options",
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: [
							"code",
						],
					},
				},
				options: [
					{
						name: "Execute",
						value: "execute",
						action: 'Execute a code',
					},
				],
				default: "execute",
			},
			// Code execution properties
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
						resource: [
							"code",
						],
						operation: [
							"execute",
						],
					},
				},
				default: "module.exports = function(items) {\n  // Your code here\n  // Example: Transform input items\n  return items.map(item => {\n    // Process each item\n    return item;\n  });\n}",
				description: "JavaScript code to execute. Must export a function that takes input items and returns processed data.",
				required: true,
			},
			{
				displayName: "Input Items",
				name: "items",
				type: "json",
				displayOptions: {
					show: {
						resource: [
							"code",
						],
						operation: [
							"execute",
						],
					},
				},
				default: "={{ $json }}",
				description: "The input data to pass to the JavaScript function",
			},
			{
				displayName: "Cache Key",
				name: "cacheKey",
				type: "string",
				displayOptions: {
					show: {
						resource: [
							"code",
						],
						operation: [
							"execute",
						],
					},
				},
				default: "={{ $workflow.id }}-{{ $node.id }}",
				description: "Unique identifier for caching dependencies",
				required: true,
			},
			{
				displayName: "Timeout",
				name: "timeout",
				type: "number",
				displayOptions: {
					show: {
						resource: [
							"code",
						],
						operation: [
							"execute",
						],
					},
				},
				default: 60000,
				description: "Maximum execution time in milliseconds",
			},
			{
				displayName: "Force Update Dependencies",
				name: "forceUpdate",
				type: "boolean",
				displayOptions: {
					show: {
						resource: [
							"code",
						],
						operation: [
							"execute",
						],
					},
				},
				default: false,
				description: "Whether to force fresh installation of dependencies",
			},
			{
				displayName: "Debug Mode",
				name: "debug",
				type: "boolean",
				displayOptions: {
					show: {
						resource: [
							"code",
						],
						operation: [
							"execute",
						],
					},
				},
				default: false,
				description: "Whether to return detailed debug information about the execution",
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		// Implementation will be added in future updates
		const items = this.getInputData();
		return [items]; // Return input items unchanged for now
	}
}
