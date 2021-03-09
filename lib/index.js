'use strict';
const path = require('path');

class ServerlessFargateTasks {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.service = serverless.service;
    this.provider = serverless.getProvider('aws');
    this.stage = this.provider.getStage();
    this.options = options || {};
    this.debug = this.options.debug || process.env.SLS_DEBUG;
    this.colors = get(this.serverless, 'processedInput.options.color', true);
    this.hooks = {
      'package:compileFunctions': this.compileTasks.bind(this)
    };

    // relevant since sls v1.78.0
    if (this.serverless.configSchemaHandler) {
      const fargateSchema = {
        type: 'object',
        properties: {
          environment: { type: 'object' },
          role: { type: 'string' },
          tasks: { type: 'object' },
        },
        required: ['tasks'],
      };
      this.serverless.configSchemaHandler.defineTopLevelProperty(
        'fargate',
        fargateSchema,
      );
    } else {
      this.addVariables();
    }
  }

  compileTasks() {
    const template = this.serverless.service.provider.compiledCloudFormationTemplate;
    const colors = this.colors;
    const options = this.serverless.service.fargate;
    const debug = this.debug;
    const consoleLog = this.serverless.cli.consoleLog;

    if (debug) consoleLog(yellow('Fargate Tasks Plugin'));

    // add the cluster
    template['Resources']['FargateTasksCluster'] = {
      "Type": "AWS::ECS::Cluster",
      "Properties": {
        "CapacityProviders": ["FARGATE"],
        "ClusterName": `${this.service.service}-${this.stage}`
      }
    }

    // Create a loggroup for the logs
    template['Resources']['FargateTasksLogGroup'] = {
      "Type": "AWS::Logs::LogGroup",
      "Properties": {
        "LogGroupName": `${this.service.service}-${this.stage}`
      }
    }

    // for each defined task, we create a service and a task, and point it to
    // the created cluster
    Object.keys(options.tasks).forEach(identifier => {
      if (debug) consoleLog(yellow('Processing ' + identifier));
      // consoleLog(options.tasks[identifier]);

      // get all override values, if they exists
      var override = options.tasks[identifier]['override'] || {}
      var container_override = override['container'] || {}
      var task_override = override['task'] || {}

      var name = options.tasks[identifier]['name'] || identifier
      var normalizedIdentifier = this.provider.naming.normalizeNameToAlphaNumericOnly(identifier)

      // consoleLog(override);
      if (!override.hasOwnProperty('role')) {
        // check if the default role can be assumed by ecs, if not, make it so
        if(template.Resources.IamRoleLambdaExecution.Properties.AssumeRolePolicyDocument.Statement[0].Principal.Service.indexOf('ecs-tasks.amazonaws.com') == -1) {
          template.Resources.IamRoleLambdaExecution.Properties.AssumeRolePolicyDocument.Statement[0].Principal.Service.push('ecs-tasks.amazonaws.com')

          // check if there already is a ManagedPolicyArns array, if not, create it
          if(!template.Resources.IamRoleLambdaExecution.Properties.hasOwnProperty('ManagedPolicyArns')) {
            template.Resources.IamRoleLambdaExecution.Properties['ManagedPolicyArns'] = [];
          }
          template.Resources.IamRoleLambdaExecution.Properties['ManagedPolicyArns'].push('arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy')
        }
      }

      // create a key/value list for the task environment
      let environment = []
      if(options.tasks[identifier].hasOwnProperty('environment')) {

        // when a global environment is set, we need to extend it
        var target_environment = options['environment'] || {}
        target_environment = Object.assign(target_environment, options.tasks[identifier].environment)

        Object.keys(target_environment).forEach(function(key,index) {
          let value = target_environment[key];
          environment.push({"Name": key, "Value": value})
        })
      }

      // create the container definition
      var definitions = Object.assign({
        'Name': name,
        'Image': options.tasks[identifier]['image'],
        'Environment': environment,
        'LogConfiguration': {
          'LogDriver': 'awslogs',
          'Options': {
            'awslogs-region':{"Fn::Sub": "${AWS::Region}"},
            'awslogs-group': {"Fn::Sub": "${FargateTasksLogGroup}"},
            'awslogs-stream-prefix': 'fargate'
          },
        },
        'Command': options.tasks[identifier]['command']
      }, container_override)

      // create the task definition
      var task = {
        'Type': 'AWS::ECS::TaskDefinition',
        'Properties': Object.assign({
          'ContainerDefinitions': [definitions],
          'Family': name,
          'NetworkMode': 'awsvpc',
          'ExecutionRoleArn': options['role'] || {"Fn::Sub": 'arn:aws:iam::${AWS::AccountId}:role/ecsTaskExecutionRole'},
          'TaskRoleArn': override['role'] || {"Fn::Sub": '${IamRoleLambdaExecution}'},
          'RequiresCompatibilities': ['FARGATE'],
          'Memory': options.tasks[identifier]['memory'] || "0.5GB",
          'Cpu': options.tasks[identifier]['cpu'] || 256,
        }, task_override)
      }
      template['Resources'][normalizedIdentifier + 'Task'] = task
    });

    function yellow(str) {
      if (colors) return '\u001B[33m' + str + '\u001B[39m';
      return str;
    }

  }

  addVariables() {
    const servicePath = this.serverless.config.servicePath;
    if (!servicePath) {
      return BbPromise.resolve();
    }

    const fromYamlFile = serverlessYmlPath => this.serverless.yamlParser.parse(serverlessYmlPath);

    let parse = null;
    const serviceFileName = this.options.config || this.serverless.config.serverless.service.serviceFilename || 'serverless.yml';
    const serverlessYmlPath = path.join(servicePath, serviceFileName);

    if (['.js', '.json', '.ts'].includes(path.extname(serverlessYmlPath))) {
      parse = this.loadFromRequiredFile;
    } else {
      parse = fromYamlFile;
    }
    return parse(serverlessYmlPath)
      .then(serverlessFileParam => this.serverless.variables.populateObject(serverlessFileParam)
        .then((parsedObject) => {
          this.serverless.service.fargate.environment = parsedObject.fargate
            && parsedObject.fargate.environment
            ? parsedObject.fargate.environment : {};
          this.serverless.service.fargate.role = parsedObject.fargate
            && parsedObject.fargate.role
            ? parsedObject.fargate.role : null;
          this.serverless.service.fargate.tasks = parsedObject.fargate
            && parsedObject.fargate.tasks
            ? parsedObject.fargate.tasks : {};
        }));
  }
}

function get(obj, path, def) {
  return path.split('.').filter(Boolean).every(step => !(step && (obj = obj[step]) === undefined)) ? obj : def;
}

module.exports = ServerlessFargateTasks;
