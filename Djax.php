<?php
/**
 * Created by PhpStorm.
 * User: mikel
 * Date: 11/7/15
 * Time: 11:31 PM
 */

namespace anmishael\djax;


use yii\widgets\Pjax;
use yii\bootstrap\Html;
use Yii;
use yii\helpers\Json;
use yii\web\Response;

class Djax extends Pjax {
	/**
     * @inheritdoc
     */
    public function init()
    {
        if (!isset($this->options['id'])) {
            $this->options['id'] = $this->getId();
        }

        if ($this->requiresDjax()) {
            ob_start();
            ob_implicit_flush(false);
            $view = $this->getView();
            $view->clear();
            $view->beginPage();
            $view->head();
            $view->beginBody();
            if ($view->title !== null) {
                echo Html::tag('title', Html::encode($view->title));
            }
        } else {
            echo Html::beginTag('div', $this->options);
        }
    }
	/**
     * @inheritdoc
     */
    public function run()
    {
        if (!$this->requiresDjax()) {
            echo Html::endTag('div');
            $this->registerClientScript();

            return;
        }

        $view = $this->getView();
        $view->endBody();

        // Do not re-send css files as it may override the css files that were loaded after them.
        // This is a temporary fix for https://github.com/yiisoft/yii2/issues/2310
        // It should be removed once djax supports loading only missing css files
        $view->cssFiles = null;

        $view->endPage(true);

        $content = ob_get_clean();

        // only need the content enclosed within this widget
        $response = Yii::$app->getResponse();
        $response->clearOutputBuffers();
        $response->setStatusCode(200);
        $response->format = Response::FORMAT_HTML;
        $response->content = $content;
        $response->send();

        Yii::$app->end();
    }

    /**
     * @return boolean whether the current request requires djax response from this widget
     */
    protected function requiresDjax()
    {
        $headers = Yii::$app->getRequest()->getHeaders();
        return $headers->get('X-Djax') && $headers->get('X-Djax-Container') === '#' . $this->options['id'];
    }

    /**
     * Registers the needed JavaScript.
     */
    public function registerClientScript()
    {
        $id = $this->options['id'];
        $this->clientOptions['push'] = $this->enablePushState;
        $this->clientOptions['replace'] = $this->enableReplaceState;
        $this->clientOptions['timeout'] = $this->timeout;
        $this->clientOptions['scrollTo'] = $this->scrollTo;
        $options = Json::htmlEncode($this->clientOptions);
        $js = '';
        if ($this->linkSelector !== false) {
            $linkSelector = Json::htmlEncode($this->linkSelector !== null ? $this->linkSelector : '#' . $id . ' a');
            $js .= "jQuery(document).djax($linkSelector, \"#$id\", $options);";
        }
        if ($this->formSelector !== false) {
            $formSelector = Json::htmlEncode($this->formSelector !== null ? $this->formSelector : '#' . $id . ' form[data-djax]');
            $js .= "\njQuery(document).on('submit', $formSelector, function (event) {jQuery.djax.submit(event, '#$id', $options);});";
        }
        $view = $this->getView();
        DjaxAsset::register($view);

        if ($js !== '') {
            $view->registerJs($js);
        }
    }
}