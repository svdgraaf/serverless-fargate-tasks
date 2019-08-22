Serverless Fargate Tasks
------------------------
This Serverless plugin will setup a Fargate cluster and setup services and tasks.
With this plugin it's fairly easy to setup a (long running) task which would hook up to kinesis streams or SQS endpoints.

The (minimal) config is as follows:

```
custom:
  fargate:
    vpc:
      subnets:
        - subnet-1234
        - subnet-5678

    tasks:
      my-task:
        image: 123456789369.dkr.ecr.eu-west-1.amazonaws.com/my-image
```

Of course, you can customize to your hearts desire, here are all the available options:

```
custom:
  fargate:
    # you can put global environment variables here, these will be added
    # to all tasks. Optional of course.
    environment:
      foo: bar

    # you can set the execution role that will be used, this will default to the default
    # role for your account
    role: arn:aws:iam::123456789369:role/ecsTaskExecutionRole

    vpc:
      public-ip: DISABLED  # optional, defaults to disabled
      subnets:
        - subnet-1234
        - subnet-5678
      security-groups:  # optional, defaults to vpc default
        - sg-123456678

    tasks:
      my-task:
        name: ${self:service}-${self:provider.stage}-my-task # default name is be the object key (here 'my-task')
        image: 123456789369.dkr.ecr.eu-west-1.amazonaws.com/my-image
        environment:  # optional
          platypus: true
          # local variables will always override global ones
          foo: wut
          # you can also use cloudformation references with eg serverless-pseudo-parameters
          myArn: #{MyResource.Arn}
        cpu: 512  # optional, defaults to 25% -> 256, see cloudformation docs for valid values
        memory: 1GB  # optional, defaults to 0.5GB
        noService: true # optional, defaults to false.
                        # If set to `true`, will not create ECS service - tasks may then be executed using AWS API via `run-task`instead.
```

Advanced usage
--------------
You can override the generated CF resource properties per task with the `override` properties:

```
custom:
  fargate:
    tasks:
      my-task:
        image: 123456789369.dkr.ecr.eu-west-1.amazonaws.com/my-image

        # these are all optional
        override:
          task:
            Foo: BAR
          container:
            Foo: Bar
          service:
            Foo: BAR
          vpc:
            Foo: BAR
          role: ARN
```
