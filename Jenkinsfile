pipeline {
  agent any

  parameters {
    string(name: 'VERSION', defaultValue: 'v1', description: 'Image version to deploy, for example v1 or v2')
    string(name: 'BACKEND_URL', defaultValue: 'http://localhost:4000', description: 'Control backend URL')
  }

  environment {
    APP_NAME = 'myapp'
    VERSION = "${params.VERSION}"
    BACKEND_URL = "${params.BACKEND_URL}"
  }

  stages {
    stage('Build image') {
      steps {
        sh '''
          docker build \
            --build-arg APP_VERSION=${VERSION} \
            -t ${APP_NAME}:${VERSION} \
            ./app
        '''
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        sh '''
          kubectl patch deployment/${APP_NAME} \
            -p "{\\"spec\\":{\\"template\\":{\\"spec\\":{\\"containers\\":[{\\"name\\":\\"${APP_NAME}\\",\\"image\\":\\"${APP_NAME}:${VERSION}\\",\\"env\\":[{\\"name\\":\\"APP_VERSION\\",\\"value\\":\\"${VERSION}\\"},{\\"name\\":\\"FLASK_DEBUG\\",\\"value\\":\\"false\\"},{\\"name\\":\\"FLASHSALE_DB_PATH\\",\\"value\\":\\"/data/flashsale.db\\"},{\\"name\\":\\"FLASHSALE_LOG_PATH\\",\\"value\\":\\"/data/logs/flashsale.log\\"}]}]}}}}"
        '''
      }
    }

    stage('Health check') {
      steps {
        script {
          def failed = sh(
            script: '''
              set +e
              kubectl rollout status deployment/${APP_NAME} --timeout=60s
              ROLLOUT=$?
              URL=$(minikube service myapp-service --url)
              curl -fsS "$URL/health"
              HEALTH=$?
              if [ "$ROLLOUT" -ne 0 ] || [ "$HEALTH" -ne 0 ]; then
                exit 1
              fi
            ''',
            returnStatus: true
          )

          if (failed != 0) {
            env.AUTHOR = sh(script: 'git log -1 --pretty=format:%an || echo unknown', returnStdout: true).trim()
            sh '''
              kubectl rollout undo deployment/${APP_NAME}
              curl -sS -X POST "${BACKEND_URL}/api/incident" \
                -H "Content-Type: application/json" \
                -d "{\\"author\\":\\"${AUTHOR}\\",\\"version\\":\\"${VERSION}\\",\\"reason\\":\\"Health check failed after deployment\\",\\"action\\":\\"Auto rollback\\",\\"restored\\":\\"System restored to last stable version\\"}"
            '''
            error('Deployment failed health check; rollback completed.')
          }
        }
      }
    }
  }
}
