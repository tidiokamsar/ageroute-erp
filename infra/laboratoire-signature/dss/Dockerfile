# DSS — validation PAdES, construit depuis les sources OFFICIELLES de la
# Commission européenne (dépôt esig/dss-demonstrations, version épinglée).
# Aucune image Docker n'est publiée par l'éditeur : on la construit, ce qui
# garantit la provenance. LABORATOIRE — sans valeur juridique.
FROM maven:3.9.9-eclipse-temurin-17 AS build
ARG DSS_VERSION=6.1
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${DSS_VERSION} https://github.com/esig/dss-demonstrations.git .
# Les artefacts sd-dss (dont dss-standalone-app-package, que la webapp embarque)
# ne sont PAS sur Maven Central : ils vivent sur le dépôt officiel de la
# Commission (Digital Building Blocks). Premier build échoué exactement là-dessus.
RUN mkdir -p /root/.m2 && cat > /root/.m2/settings.xml <<'XML'
<settings>
  <profiles>
    <profile>
      <id>cefdigital</id>
      <repositories>
        <repository>
          <id>cefdigital-esignaturedss</id>
          <url>https://ec.europa.eu/digital-building-blocks/artifact/repository/esignaturedss/</url>
          <releases><enabled>true</enabled></releases>
          <snapshots><enabled>false</enabled></snapshots>
        </repository>
      </repositories>
    </profile>
  </profiles>
  <activeProfiles><activeProfile>cefdigital</activeProfile></activeProfiles>
</settings>
XML
# Seul le webapp REST/SOAP nous sert ; on ignore les tests et les modules annexes.
RUN mvn -q -B -pl dss-demo-webapp -am -DskipTests -Dmaven.javadoc.skip=true package

FROM tomcat:10.1-jre17-temurin
ARG DSS_VERSION=6.1
LABEL org.opencontainers.image.title="DSS laboratoire AGEROUTE" \
      org.opencontainers.image.description="Validation PAdES — laboratoire, sans valeur juridique" \
      org.opencontainers.image.version="${DSS_VERSION}"
RUN rm -rf /usr/local/tomcat/webapps/*
COPY --from=build /src/dss-demo-webapp/target/dss-demo-webapp-*.war /usr/local/tomcat/webapps/dss-webapp.war
ENV JAVA_OPTS="-Xms256m -Xmx1024m"
EXPOSE 8080
